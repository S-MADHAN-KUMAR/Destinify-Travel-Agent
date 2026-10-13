"""Conversational node: answer follow-ups without re-running the whole planner.

This is what stops the agent from replying with the same trip plan every time.
Questions about an existing plan ("best time to visit?", "is day 2 too packed?",
"thanks!") land here: the LLM answers with the traveller's memory + conversation
in context, while the trip board keeps showing the last plan.

Falls back to a deterministic, memory-aware reply when no LLM key is configured.
"""

from __future__ import annotations

import logging

from app.agents import classifier as classifier_mod
from app.agents.memory import memory_context
from app.agents.state import (
    LongMemory,
    MemoryPayload,
    TravelDetails,
    TravelPlannerState,
)

logger = logging.getLogger(__name__)

CHAT_SYSTEM = """You are Destinify, a warm, practical travel assistant inside a trip-planning app.
You can see the traveller's profile (home city, interests, past destinations) and the recent conversation.

Rules:
- Answer the user's question directly with concrete, real travel advice (seasons, timings, costs, logistics).
- If a trip has already been planned for them, refer to it naturally and offer ONE concrete next step
  (add a day, change the pace, swap hotels, compare trains/flights, add a city).
- Never claim you have booked anything. Never re-list an itinerary they already have.
- 2-4 short sentences. Plain text, no markdown headings, no bullet lists, no emoji.
- End with at most one short question."""


def _fallback_reply(details: TravelDetails, long: LongMemory, short) -> tuple[str, str]:
    """Deterministic reply when no LLM key is configured."""
    recent = [t for t in short if t.role == "user"][-3:]
    last = recent[-1].text.strip() if recent else ""
    planned = long.past_destinations[-1] if long.past_destinations else None

    if planned:
        lead = f"About your {planned} trip —"
        text = (
            f"Your {planned} plan is still open on the trip board with its days, places, food, "
            "stays and map. "
        )
        if long.interests:
            text += f"I've kept your interests ({', '.join(long.interests[:4])}) in mind. "
        text += "Tell me what to change — add a day, swap the hotel, pick a different pace, or compare trains and flights."
        return lead, text

    lead = "Happy to help."
    text = (
        "Tell me a destination and roughly how long (for example, \"4 days in Kerala\") and I'll "
        "build the full day-by-day plan with places, food, stays and transport."
    )
    if last:
        text = "I can plan that as soon as we have a destination."
    return lead, text


def chat_node(state: TravelPlannerState) -> dict:
    """Reply conversationally using memory + conversation context (no re-plan)."""
    details = state.get("details") or TravelDetails()
    long = state.get("long_memory") or LongMemory()
    short = state.get("short_memory", [])
    message = state.get("user_message", "")

    ctx = memory_context(details, MemoryPayload(short=short, long=long))

    llm = classifier_mod.get_llm()
    if llm is None:
        lead, text = _fallback_reply(details, long, short)
        return {"reply_lead": lead, "reply_text": text,
                "notes": ["Answered from memory (no LLM key configured)."]}

    lines = ["About the traveller:", ctx or "(no memory yet)", ""]
    # The most recent plan summary from memory ("Planned 3 days in Jaipur.")
    plan_hint = next(
        (t.text for t in reversed(short) if t.role == "agent" and t.text.startswith("Planned ")), "")
    if plan_hint:
        lines.append(f"Existing plan on their board: {plan_hint}")
    lines.append(f"Latest message: {message}")
    try:
        resp = llm.invoke([
            {"role": "system", "content": CHAT_SYSTEM},
            {"role": "user", "content": "\n".join(lines)},
        ])
        text = (resp.content if hasattr(resp, "content") else str(resp)).strip()
        if not text:
            raise ValueError("empty LLM reply")
        return {"reply_lead": "", "reply_text": text, "notes": ["Answered conversationally (no re-plan)."]}
    except Exception as exc:  # noqa: BLE001 - must never break the conversation
        logger.warning("chat node LLM unavailable, using fallback: %s", exc)
        lead, fb = _fallback_reply(details, long, short)
        return {"reply_lead": lead, "reply_text": fb, "notes": ["Answered from memory fallback."]}
