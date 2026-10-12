"""User-message classifier agent (LangChain + Groq, typed extraction into state)."""

from __future__ import annotations

import re
from datetime import datetime

from app.agents.state import REQUIRED_FIELDS, TravelDetails, TravelPlannerState
from app.core.config import settings

CLASSIFIER_SYSTEM = """You extract travel details from a user message.
Return ONLY the structured fields: origin, destination, travel_date (YYYY-MM-DD),
return_date (YYYY-MM-DD), passengers, budget_inr, preferred_modes (subset of
train/flight/bus/cab/transit), intent (travel_search|price_check|booking_help|other),
confidence (0-1). Leave unknown fields null/empty. Never invent cities."""


def get_llm():
    """Build the Groq chat model, or None when no key is configured (offline fallback)."""
    if not settings.GROQ_API_KEY:
        return None
    from langchain_groq import ChatGroq

    return ChatGroq(model=settings.GROQ_MODEL, api_key=settings.GROQ_API_KEY, temperature=0)


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
        structured = llm.with_structured_output(TravelDetails)
        result = structured.invoke([
            {"role": "system", "content": CLASSIFIER_SYSTEM},
            {"role": "user", "content": message},
        ])
        if isinstance(result, TravelDetails):
            result.raw_message = message
            return result
        details = TravelDetails.model_validate(result)
        details.raw_message = message
        return details
    except Exception:  # noqa: BLE001 - LLM failure must fall back to heuristics
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
