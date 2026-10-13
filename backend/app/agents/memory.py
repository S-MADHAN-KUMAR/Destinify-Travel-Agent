"""Long-term + short-term memory for the trip agent.

Short-term memory: the last N turns of the current thread (rolling window).
Long-term memory: a durable user profile (home city, interests, budget style,
past trips) that survives across sessions.

The frontend is the source of truth (localStorage) and round-trips this payload
with every request; the graph merges it into state and returns the updated
version to persist. A server-side dict keyed by session_id backs it up so the
agent still has context if the client omits memory.
"""

from __future__ import annotations

from app.agents.state import (
    LongMemory,
    MemoryPayload,
    ShortMemoryTurn,
    TravelDetails,
)
from app.core.config import settings

# Server-side fallback so a stateless client still gets continuity per session.
_SERVER_MEMORY: dict[str, MemoryPayload] = {}


def load_memory(session_id: str, incoming: MemoryPayload | None) -> MemoryPayload:
    """Merge client-provided memory with any server-side copy for this session."""
    stored = _SERVER_MEMORY.get(session_id)
    if incoming is None:
        incoming = MemoryPayload()

    long = incoming.long
    # Server copy can backfill a home city the client forgot, but the client
    # (localStorage) wins on fields it actually set.
    if stored:
        if not long.home_city and stored.long.home_city:
            long.home_city = stored.long.home_city
        for dest in stored.long.past_destinations:
            if dest not in long.past_destinations:
                long.past_destinations.append(dest)
        for interest in stored.long.interests:
            if interest not in long.interests:
                long.interests.append(interest)
        if not long.notes and stored.long.notes:
            long.notes = stored.long.notes

    short = incoming.short[-settings.SHORT_MEMORY_TURNS:]
    payload = MemoryPayload(short=short, long=long)
    _SERVER_MEMORY[session_id] = payload
    return payload


def save_memory(session_id: str, payload: MemoryPayload) -> None:
    _SERVER_MEMORY[session_id] = payload


def update_long_memory(long: LongMemory, details: TravelDetails) -> LongMemory:
    """Fold this turn's extraction into the durable profile."""
    if details.origin and not long.home_city:
        # A departure city the user starts from is a decent home-city signal.
        long.home_city = details.origin
    if details.origin and details.origin not in long.past_destinations:
        pass  # origin isn't a "destination visited"
    if details.destination and details.destination not in long.past_destinations:
        # Only record a destination once the trip is real (has a plan).
        pass
    for interest in details.interests:
        if interest not in long.interests:
            long.interests.append(interest)
    if details.travellers and details.travellers > 0:
        long.travellers = details.travellers
    if details.budget_inr:
        long.budget_style = _budget_style(details.budget_inr, details.travellers)
    if details.destination and details.destination not in long.past_destinations:
        long.past_destinations.append(details.destination)
        long.past_destinations = long.past_destinations[-12:]
    return long


def _budget_style(budget_inr: float, travellers: int) -> str:
    per_head = budget_inr / max(1, travellers)
    if per_head < 15000:
        return "budget"
    if per_head < 60000:
        return "mid"
    return "luxury"


def append_turn(short: list[ShortMemoryTurn], user_message: str, agent_summary: str) -> list[ShortMemoryTurn]:
    short = list(short)
    short.append(ShortMemoryTurn(role="user", text=user_message))
    short.append(ShortMemoryTurn(role="agent", text=agent_summary))
    return short[-settings.SHORT_MEMORY_TURNS:]


def memory_context(details: TravelDetails, payload: MemoryPayload) -> str:
    """Render memory as a compact text block for the planner/classifier prompts."""
    lines: list[str] = []
    long = payload.long
    if long.home_city:
        lines.append(f"Traveller's home/departure city: {long.home_city}.")
    if long.interests:
        lines.append(f"Known interests: {', '.join(long.interests)}.")
    if long.budget_style and long.budget_style != "unknown":
        lines.append(f"Budget style: {long.budget_style}.")
    if long.preferred_modes:
        lines.append(f"Preferred transport: {', '.join(long.preferred_modes)}.")
    if long.past_destinations:
        lines.append(f"Previously discussed/visited: {', '.join(long.past_destinations)}.")
    if long.travellers:
        lines.append(f"Typical group size: {long.travellers}.")
    if payload.short:
        recent = "; ".join(f"{t.role}: {t.text}" for t in payload.short[-6:] if t.text)
        if recent:
            lines.append(f"Recent conversation: {recent}")
    return "\n".join(lines)
