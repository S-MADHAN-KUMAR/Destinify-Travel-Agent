"""Supervisor agent: picks which mode subagents to fan out to."""

from __future__ import annotations

from app.agents.state import ALL_MODES, TravelPlannerState


def supervisor_node(state: TravelPlannerState) -> dict:
    """Decide selected_modes from user preference, else query all modes."""
    details = state.get("details")
    preferred = list(details.preferred_modes) if details and details.preferred_modes else []
    selected = [m for m in preferred if m in ALL_MODES] or list(ALL_MODES)
    notes = [f"Supervisor selected modes: {', '.join(selected)}."]
    return {"selected_modes": selected, "notes": notes}
