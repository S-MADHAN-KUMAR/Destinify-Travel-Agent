"""Supervisor agent: decides which research capabilities to fan out to.

A full trip plan runs everything; a targeted ask (transport/food/stay) runs just
what's needed plus light context so the map still has pins.
"""

from __future__ import annotations

from app.agents.state import ALL_CAPABILITIES, Capability, TravelPlannerState

_INTENT_CAPABILITIES: dict[str, list[Capability]] = {
    "trip_plan": ["attractions", "food", "stay", "transport"],
    "general": ["attractions", "food", "stay", "transport"],
    "transport_search": ["transport", "attractions"],
    "food_search": ["food", "attractions"],
    "stay_search": ["stay", "attractions"],
}


def supervisor_node(state: TravelPlannerState) -> dict:
    details = state.get("details")
    intent = details.intent if details else "trip_plan"
    selected = list(_INTENT_CAPABILITIES.get(intent, ALL_CAPABILITIES))
    # Always keep the order stable.
    ordered = [c for c in ALL_CAPABILITIES if c in selected]
    return {"capabilities": ordered, "notes": [f"Supervisor selected: {', '.join(ordered)}."]}
