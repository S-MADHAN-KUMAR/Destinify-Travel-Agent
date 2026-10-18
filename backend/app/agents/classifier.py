"""Classifier agent (LangChain + Groq, typed extraction into state).

Upgrades over the original:
  * extracts richer trip fields (days, interests, pace, trip_type, intent);
  * is memory-aware (fills origin from the traveller's home city, honours
    known interests) so it stops re-asking for things it already knows;
  * only blocks on a genuinely unknown destination — a "3 day trip to Paris"
    now proceeds with sensible defaults instead of dead-ending forever.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime

from pydantic import BaseModel, Field

from app.agents.memory import memory_context
from app.agents.state import (
    ALL_MODES,
    LongMemory,
    MemoryPayload,
    TravelDetails,
    TravelPlannerState,
    TripIntent,
)
from app.core.config import settings

logger = logging.getLogger(__name__)

VALID_INTENTS: tuple[TripIntent, ...] = (
    "trip_plan", "transport_search", "food_search", "stay_search", "general",
)

CLASSIFIER_SYSTEM = """You extract travel details from a user message for a trip-planning agent.
Return ONLY structured fields. Rules:
- origin / destination: cities or places. destination is where they want to GO.
- days: trip length in days. "3 day trip"/"3 days"->3, "weekend"->2, "a week"->7, "two weeks"->14. null if unknown.
- start_date / end_date: YYYY-MM-DD if stated, else null.
- travellers: number of people (default 1).
- budget_inr: total budget in INR if stated (₹, Rs, INR, or plain number).
- interests: subset of [food, culture, history, nature, adventure, nightlife, beach, mountains, shopping, photography, family, luxury, budget, spa, wildlife, spirituality].
- pace: relaxed | balanced | packed.
- trip_type: short phrase like "leisure", "adventure", "food tour", "honeymoon", "family", "business", "solo".
- intent: trip_plan (plan an itinerary) | transport_search (compare tickets/fares) | food_search | stay_search | general.
- confidence: 0-1.
Null out anything the message does not state. Never invent a destination city.
The message may open with 'Conversation so far: ... Latest message: ...': the latest message is what the user just said; conversation-so-far is context you may use to fill gaps.
IMPORTANT: decide `intent` from the LATEST message ONLY. A question or remark about an
existing plan (\"best time to visit?\", \"thanks!\", \"is day 2 too packed?\") is `general`,
never `trip_plan` — only ask for a plan when the user is actually asking you to build/change one."""


class ClassifierFields(BaseModel):
    """LLM-facing extraction schema (all nullable; normalised into TravelDetails)."""

    origin: str | None = Field(default=None, description="Origin city/station/airport")
    destination: str | None = Field(default=None, description="Destination city/place")
    days: int | None = Field(default=None, description="Trip length in days if stated")
    start_date: str | None = Field(default=None, description="Start date YYYY-MM-DD")
    end_date: str | None = Field(default=None, description="End date YYYY-MM-DD")
    travellers: int | None = Field(default=None, description="Number of travellers")
    budget_inr: float | None = Field(default=None, description="Total budget in INR")
    interests: list[str] | None = Field(default=None, description="Interests subset")
    pace: str | None = Field(default=None, description="relaxed | balanced | packed")
    trip_type: str | None = Field(default=None, description="leisure|adventure|food|honeymoon|family...")
    intent: str | None = Field(default=None, description="trip_plan|transport_search|food_search|stay_search|general")
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


VALID_PACES = ("relaxed", "balanced", "packed")

# Generic words the offline heuristic must not treat as a real destination/origin.
_NON_PLACES = {
    "somewhere", "anywhere", "someplace", "place", "city", "nice", "warm",
    "beautiful", "good", "great", "quiet", "there", "here", "nice place",
    "a place", "some where", "any where", "nice city", "warm place",
}


def get_llm():
    """Build the chat model, or None when no key is configured (offline fallback)."""
    if settings.LLM_BASE_URL and settings.LLM_MODEL:
        try:
            from langchain_openai import ChatOpenAI
        except ImportError:
            ChatOpenAI = None  # type: ignore[assignment]
        if ChatOpenAI is not None:
            api_key = settings.LLM_API_KEY or settings.GROQ_API_KEY
            if not api_key:
                return None
            return ChatOpenAI(
                model=settings.LLM_MODEL, base_url=settings.LLM_BASE_URL,
                api_key=api_key, temperature=0,
            )
    api_key = settings.GROQ_API_KEY or settings.LLM_API_KEY
    model = settings.LLM_MODEL or settings.GROQ_MODEL
    if not api_key or not model:
        return None
    from langchain_groq import ChatGroq

    return ChatGroq(model=model, api_key=api_key, temperature=0)


def _clean_interests(raw: list[str] | None) -> list[str]:
    if not raw:
        return []
    valid = {"food", "culture", "history", "nature", "adventure", "nightlife",
             "beach", "mountains", "shopping", "photography", "family",
             "luxury", "budget", "spa", "wildlife", "spirituality"}
    out: list[str] = []
    for item in raw:
        for part in str(item).lower().replace("/", ",").split(","):
            part = part.strip()
            if part in valid and part not in out:
                out.append(part)
    return out


def _detect_intent(message: str, raw_intent: str | None) -> TripIntent:
    if raw_intent in VALID_INTENTS:
        return raw_intent  # type: ignore[return-value]
    lower = message.lower()
    if re.search(r"\b(train|flight|bus|ticket|fare|price of travel)\b", lower) and not re.search(r"\b(plan|itinerary|trip plan)\b", lower):
        return "transport_search"
    if re.search(r"\b(restaurant|food|eat|dining|cafe|cuisine)\b", lower) and not re.search(r"\btrip\b", lower):
        return "food_search"
    if re.search(r"\b(hotel|stay|accommodation|hostel|where to stay)\b", lower) and not re.search(r"\btrip\b", lower):
        return "stay_search"
    if re.search(r"\b(plan|itinerary|trip|holiday|vacation|days?)\b", lower):
        return "trip_plan"
    return "general"


# --------------------------------------------------------------------------- #
# Is this message actually asking for (re)planning, or just conversation?      #
# --------------------------------------------------------------------------- #

# Verbs that clearly mean "build or modify an itinerary".
_STRONG_VERBS = re.compile(
    r"\b(plan|planning|planner|itinerar\w*|organiz\w*|organis\w*|arrange\w*|build|create|"
    r"make|draft|design|schedule|compile|put together|map out|day[- ]by[- ]day|"
    r"add|extend|another|extra|change|modify|update|revise|redo|swap|replace|"
    r"shorten|trim|reduce|increase|bump|compare|book\w*)\b",
    re.IGNORECASE,
)
# "3 day trip", "weekend", "a week"…
_DAYS_RE = re.compile(
    r"\b\d+\s*-?\s*day|\bweekend\b|\ba week\b|\btwo weeks\b|\bfortnight\b", re.IGNORECASE)
# "trip to X" / "holiday in X" — a scoped travel request, unlike a bare "visit X" question.
_TRAVEL_SCOPE_RE = re.compile(
    r"\b(trip|holiday|vacation|itinerary|travel|getaway|break)\s+(to|in|for|near)\b", re.IGNORECASE)
# Signals that the user is after a NEW place, so don't backfill the last destination.
_NEW_PLACE_RE = re.compile(
    r"\b(somewhere else|someplace else|anywhere else|elsewhere|"
    r"another (city|country|destination|place)|different (city|country|destination|place))\b",
    re.IGNORECASE)


def wants_plan(message: str, details: TravelDetails, past_destinations: list[str]) -> bool:
    """True when the LATEST message is asking us to build or change an itinerary.

    Guards against the classic failure mode: a follow-up question
    ("what's the best time to visit?") being classified as a fresh trip plan and
    re-running the whole planner, so every reply looks identical.
    """
    if _DAYS_RE.search(message) or _TRAVEL_SCOPE_RE.search(message) or _STRONG_VERBS.search(message):
        return True
    # A brand-new destination is an implicit "plan something for me here".
    if details.destination and details.destination.lower() not in {p.lower() for p in past_destinations}:
        return True
    return False


def heuristic_extract(message: str) -> TravelDetails:
    """Offline fallback: regex-based extraction so the graph works without an LLM key."""
    text = message.strip()
    # When the message carries a 'Conversation so far: ... Latest message: ...'
    # wrapper, extract facts from the LATEST message only — otherwise an older
    # "Planned 3 days in Jaipur." silently wins over "make it 5 days".
    latest = text.split("Latest message:")[-1].strip() if "Latest message:" in text else text
    lower = latest.lower()
    origin = destination = None
    m = re.search(
        r"from\s+([a-zA-Z\s]+?)\s+to\s+([a-zA-Z\s]+?)(?:\s+on|\s+for|\s+in|\s+with|\s*,|\s*$)",
        latest, re.IGNORECASE)
    if m:
        origin, destination = m.group(1).strip().title(), m.group(2).strip().title()
    else:
        dm = re.search(
            r"(?:trip|travel|go|vacation|holiday)\s+(?:to\s+)?([a-zA-Z\s]+?)"
            r"(?:\s+from\b|\s+on\b|\s+for\b|\s+in\b|\s*,|\s*$)",
            latest, re.IGNORECASE)
        if dm:
            destination = dm.group(1).strip().title()
        # Standalone origin: "I'm from Delhi." / "from Delhi" (no "to" clause).
        if origin is None:
            om = re.search(r"\bfrom\s+([a-zA-Z\s]+?)(?:[.,]|\s+(?:on|for|in|to|by)\b|\s*$)",
                           latest, re.IGNORECASE)
            if om:
                candidate = om.group(1).strip().title()
                if candidate.lower() not in _NON_PLACES:
                    origin = candidate

    # Reject generic phrases that aren't real destinations ("somewhere nice").
    # Keeps real places even if one word is generic ("Nice, France").
    if destination:
        words = [w for w in destination.lower().replace(",", " ").split() if w]
        if words and all(w in _NON_PLACES for w in words):
            destination = None

    days = None
    dm3 = re.search(r"(\d+)\s*(?:-|\s)?\s*day", lower)
    if dm3:
        days = int(dm3.group(1))
    elif "weekend" in lower:
        days = 2
    elif re.search(r"\ba week\b|one week", lower):
        days = 7
    elif re.search(r"two weeks|fortnight", lower):
        days = 14

    start_date = None
    dm2 = re.search(r"(\d{4}-\d{2}-\d{2})", latest)
    if dm2:
        start_date = dm2.group(1)
    else:
        dm4 = re.search(r"(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?", latest)
        if dm4:
            d, mo, y = int(dm4.group(1)), int(dm4.group(2)), dm4.group(3)
            year = int(y) if y and len(y) == 4 else datetime.now().year
            try:
                start_date = f"{year:04d}-{mo:02d}-{d:02d}"
            except ValueError:
                start_date = None

    pm = re.search(r"(\d+)\s*(?:passenger|person|people|traveller|traveler|adult)", lower)
    travellers = int(pm.group(1)) if pm else 1

    bm = re.search(
        r"(?:(?:budget|cost|price|max|under|below|spend)\s*(?:is|of|around|approx)?\s*(?:only)?\s*(?:rs\.?|inr|₹)?|(?:rs\.?|inr|₹))\s*([\d,]+)\s*(k)?\b|"
        r"([\d,]+)\s*(k)?\s*(?:rs\.?|inr|₹|budget|rupees)",
        lower,
    )
    budget = None
    if bm:
        val_str = bm.group(1) or bm.group(3)
        is_k = bool(bm.group(2) or bm.group(4))
        if val_str:
            val = float(val_str.replace(",", ""))
            if is_k and val < 100:
                val *= 1000
            budget = val

    interest_map = {
        "food": ["food", "eat", "cuisine", "restaurant"],
        "culture": ["culture", "museum", "art", "heritage"],
        "history": ["history", "historical", "fort", "palace", "ancient"],
        "nature": ["nature", "hike", "trek", "mountain", "lake", "park"],
        "adventure": ["adventure", "rafting", "ski", "diving"],
        "nightlife": ["nightlife", "bar", "club", "party"],
        "beach": ["beach", "sea", "coast"],
        "shopping": ["shopping", "market", "bazaar"],
    }
    interests = [k for k, words in interest_map.items() if any(w in lower for w in words)]

    pace = "relaxed" if "relaxed" in lower or "slow" in lower else (
        "packed" if "packed" in lower or "busy" in lower else "balanced")

    intent = _detect_intent(latest, None)
    conf = 0.7 if destination else 0.3
    return TravelDetails(
        origin=origin, destination=destination, days=days, start_date=start_date,
        travellers=travellers, budget_inr=budget, interests=interests, pace=pace,  # type: ignore[arg-type]
        trip_type="", intent=intent, confidence=conf, raw_message=text)


def _apply_memory(details: TravelDetails, long: LongMemory) -> TravelDetails:
    """Fill gaps in the extraction from the durable profile."""
    if not details.origin and long.home_city:
        details.origin = long.home_city
    if not details.travellers and long.travellers:
        details.travellers = long.travellers
    for interest in long.interests:
        if interest not in details.interests:
            details.interests.append(interest)
    if not details.budget_inr and long.budget_style and long.budget_style != "unknown":
        details.trip_type = details.trip_type or f"{long.budget_style} travel"
    return details


def extract_travel_details(message: str, long: LongMemory | None = None) -> TravelDetails:
    llm = get_llm()
    if llm is None:
        details = heuristic_extract(message)
        return _apply_memory(details, long) if long else details
    try:
        structured = llm.with_structured_output(ClassifierFields, method="json_schema")
        result = structured.invoke([
            {"role": "system", "content": CLASSIFIER_SYSTEM},
            {"role": "user", "content": message},
        ])
        raw = result if isinstance(result, ClassifierFields) else ClassifierFields.model_validate(result)
        modes: list[str] = []
        details = TravelDetails(
            origin=raw.origin, destination=raw.destination, days=raw.days,
            start_date=raw.start_date, end_date=raw.end_date,
            travellers=raw.travellers or (long.travellers if long else 1) or 1,
            budget_inr=raw.budget_inr, interests=_clean_interests(raw.interests),
            pace=raw.pace if raw.pace in VALID_PACES else "balanced",
            trip_type=raw.trip_type or "",
            intent=_detect_intent(message, raw.intent),
            confidence=raw.confidence if raw.confidence is not None else 0.6,
            raw_message=message,
        )
        return _apply_memory(details, long) if long else details
    except Exception as exc:  # noqa: BLE001 - LLM failure must fall back to heuristics
        logger.warning("Classifier LLM unavailable, using heuristics: %s", exc)
        details = heuristic_extract(message)
        return _apply_memory(details, long) if long else details


def missing_fields(details: TravelDetails) -> list[str]:
    """Only a destination genuinely blocks planning; everything else has a default."""
    missing: list[str] = []
    if not details.destination:
        missing.append("destination")
    return missing


FOLLOW_UP_TEMPLATES = {
    "destination": "Where would you like to go? (a city or region)",
    "origin": "Which city are you departing from?",
    "days": "How many days is the trip?",
}


def follow_up_questions(missing: list[str], details: TravelDetails) -> list[str]:
    questions: list[str] = []
    for field in missing:
        questions.append(FOLLOW_UP_TEMPLATES.get(field, f"Could you share your {field}?"))
    # Even when we can proceed, hint at defaults so the user can correct course.
    return questions


def classifier_node(state: TravelPlannerState) -> dict:
    """LangGraph node: extract typed details, apply memory, decide follow-ups."""
    message = state.get("user_message", "")
    long = state.get("long_memory") or LongMemory()
    payload = MemoryPayload(short=state.get("short_memory", []), long=long)
    ctx = memory_context(TravelDetails(), payload)
    full_message = f"Conversation so far: {ctx}\nLatest message: {message}" if ctx else message

    details = extract_travel_details(full_message, long)
    details.raw_message = message

    facts = heuristic_extract(message)
    if facts.days is not None:
        details.days = facts.days
    if facts.budget_inr is not None:
        details.budget_inr = facts.budget_inr
    details.origin = details.origin or facts.origin
    details.start_date = details.start_date or facts.start_date

    # Follow-ups like "make it 5 days" or "how's the weather there?" omit the
    # destination — reuse the one we last planned, unless they're clearly after
    # somewhere new.
    if _NEW_PLACE_RE.search(message):
        details.destination = None
    elif not details.destination and long.past_destinations:
        details.destination = long.past_destinations[-1]

    # Also recover days from prior turn if omitted in the follow-up
    if details.days is None and payload.short:
        for t in reversed(payload.short):
            m_days = re.search(r"Planned\s+(\d+)\s+days", t.text)
            if m_days:
                details.days = int(m_days.group(1))
                break

    # Reconcile the LLM/heuristic intent with what the message is really asking:
    #  - plan-shaped message + "general"  -> plan it
    #  - question/remark about an existing plan + "trip_plan" -> talk about it
    plan = wants_plan(message, details, long.past_destinations)
    if plan and details.intent == "general":
        details.intent = "trip_plan"
    elif not plan and details.intent == "trip_plan":
        details.intent = "general"

    missing = missing_fields(details)
    questions = follow_up_questions(missing, details)
    return {
        "details": details,
        "missing_fields": missing,
        "follow_up_questions": questions,
        "needs_follow_up": bool(missing),
    }
