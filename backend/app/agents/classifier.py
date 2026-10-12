"""User-message classifier agent (LangChain + Groq, typed extraction into state)."""

from __future__ import annotations

import logging
import re
from datetime import datetime

from pydantic import BaseModel, Field

from app.agents.state import ALL_MODES, REQUIRED_FIELDS, TravelDetails, TravelPlannerState
from app.core.config import settings

logger = logging.getLogger(__name__)

CLASSIFIER_SYSTEM = """You extract travel details from a user message.
Return ONLY the structured fields: origin, destination, travel_date (YYYY-MM-DD),
return_date (YYYY-MM-DD), passengers, budget_inr, preferred_modes (subset of
train/flight/bus/cab/transit), intent (travel_search|price_check|booking_help|other),
confidence (0-1). Leave unknown fields null/empty. Never invent cities — but do keep
non-city endpoints the user names (landmarks, terminals, 'the airport', stations).
The message may open with 'Latest message: ... Trip context: ...': the latest message
is what the user just said, and the context is what was already agreed."""


class ClassifierFields(BaseModel):
    """LLM-facing extraction schema.

    Every field is nullable: the prompt tells the model to null out anything the
    message doesn't state, and providers that validate tool arguments against the
    schema (Groq does) reject `null` for non-optional types. `extract_travel_details`
    normalises the result into `TravelDetails` — the typed contract the graph runs on.
    """

    origin: str | None = Field(default=None, description="Origin city/station")
    destination: str | None = Field(default=None, description="Destination city/station")
    travel_date: str | None = Field(default=None, description="Travel date, YYYY-MM-DD if known")
    return_date: str | None = Field(default=None, description="Return date, YYYY-MM-DD if known")
    passengers: int | None = Field(default=None, description="Number of travellers if stated")
    budget_inr: float | None = Field(default=None, description="Budget in INR if stated")
    preferred_modes: list[str] | None = Field(
        default=None, description="Subset of train/flight/bus/cab/transit if stated"
    )
    intent: str | None = Field(
        default=None, description="travel_search | price_check | booking_help | other"
    )
    confidence: float | None = Field(default=None, ge=0.0, le=1.0, description="0-1")


VALID_INTENTS = ("travel_search", "price_check", "booking_help", "other")


def normalise(raw: ClassifierFields, message: str) -> TravelDetails:
    """Map a nullable LLM extraction onto the non-optional state contract."""
    modes = [
        mode
        for mode in (m.strip().lower() for m in (raw.preferred_modes or []))
        if mode in ALL_MODES
    ]
    return TravelDetails(
        origin=raw.origin,
        destination=raw.destination,
        travel_date=raw.travel_date,
        return_date=raw.return_date,
        passengers=raw.passengers or 1,
        budget_inr=raw.budget_inr,
        preferred_modes=modes,  # type: ignore[arg-type]
        intent=raw.intent if raw.intent in VALID_INTENTS else "travel_search",
        confidence=raw.confidence if raw.confidence is not None else 0.0,
        raw_message=message,
    )


def get_llm():
    """Build the chat model, or None when no key is configured (offline fallback).

    Resolution order:
      1. Generic OpenAI-compatible settings (`LLM_BASE_URL` + `LLM_MODEL` +
         `LLM_API_KEY`) when langchain-openai is installed.
      2. Groq — `LLM_MODEL` (what .env pins) takes precedence over `GROQ_MODEL`.
    """
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
                model=settings.LLM_MODEL,
                base_url=settings.LLM_BASE_URL,
                api_key=api_key,
                temperature=0,
            )

    api_key = settings.GROQ_API_KEY or settings.LLM_API_KEY
    model = settings.LLM_MODEL or settings.GROQ_MODEL
    if not api_key or not model:
        return None
    from langchain_groq import ChatGroq

    return ChatGroq(model=model, api_key=api_key, temperature=0)


def heuristic_extract(message: str) -> TravelDetails:
    """Offline fallback: regex-based extraction so the graph works without an LLM key."""
    text = message.strip()
    lower = text.lower()
    origin = destination = None
    m = re.search(r"from\s+([a-zA-Z\s]+?)\s+to\s+([a-zA-Z\s]+?)(?:\s+on|\s+for|\s+in|\s+with|\s*,|\s*$)", text, re.IGNORECASE)
    if m:
        origin, destination = m.group(1).strip().title(), m.group(2).strip().title()

    travel_date = None
    dm = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    if dm:
        travel_date = dm.group(1)
    else:
        dm2 = re.search(r"(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?", text)
        if dm2:
            d, mo, y = int(dm2.group(1)), int(dm2.group(2)), dm2.group(3)
            year = int(y) if y and len(y) == 4 else datetime.now().year
            try:
                travel_date = f"{year:04d}-{mo:02d}-{d:02d}"
            except ValueError:
                travel_date = None

    pm = re.search(r"(\d+)\s*(?:passenger|person|people|traveller|traveler|adult)", lower)
    passengers = int(pm.group(1)) if pm else 1
    bm = re.search(r"(?:rs\.?|inr|₹)\s*([\d,]+)", lower)
    budget = float(bm.group(1).replace(",", "")) if bm else None

    modes = [mode for mode in ("train", "flight", "bus", "cab", "transit")
             if mode in lower or (mode == "flight" and "flight" in lower or mode == "flight" and "fly" in lower)]
    intent = "price_check" if any(w in lower for w in ("price", "cost", "fare", "cheap")) else "travel_search"
    conf = 0.7 if (origin and destination) else 0.3
    return TravelDetails(origin=origin, destination=destination, travel_date=travel_date,
                         passengers=passengers, budget_inr=budget, preferred_modes=modes,  # type: ignore[arg-type]
                         intent=intent, confidence=conf, raw_message=text)  # type: ignore[arg-type]


def extract_travel_details(message: str) -> TravelDetails:
    llm = get_llm()
    if llm is None:
        return heuristic_extract(message)
    try:
        # json_schema: the provider validates arguments against our schema, and
        # (unlike function calling) the model can't invent a tool name that 400s.
        structured = llm.with_structured_output(ClassifierFields, method="json_schema")
        result = structured.invoke([
            {"role": "system", "content": CLASSIFIER_SYSTEM},
            {"role": "user", "content": message},
        ])
        raw = result if isinstance(result, ClassifierFields) else ClassifierFields.model_validate(result)
        return normalise(raw, message)
    except Exception as exc:  # noqa: BLE001 - LLM failure must fall back to heuristics
        logger.warning("Classifier LLM unavailable, using heuristics: %s", exc)
        return heuristic_extract(message)


def missing_fields(details: TravelDetails) -> list[str]:
    missing = []
    for field in REQUIRED_FIELDS:
        if not getattr(details, field):
            missing.append(field)
    return missing


FOLLOW_UP_TEMPLATES = {
    "origin": "Which city are you travelling from?",
    "destination": "Which city do you want to travel to?",
    "travel_date": "What date do you want to travel? (YYYY-MM-DD)",
}


def follow_up_questions(missing: list[str]) -> list[str]:
    return [FOLLOW_UP_TEMPLATES.get(f, f"Could you share your {f}?") for f in missing]


def classifier_node(state: TravelPlannerState) -> dict:
    """LangGraph node: extract typed details, keep in state, flag follow-ups."""
    message = state.get("user_message", "")
    details = extract_travel_details(message)
    missing = missing_fields(details)
    questions = follow_up_questions(missing)
    return {
        "details": details,
        "missing_fields": missing,
        "follow_up_questions": questions,
        "needs_follow_up": bool(missing),
    }
