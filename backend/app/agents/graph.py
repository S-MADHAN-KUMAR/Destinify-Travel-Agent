"""LangGraph assembly: classifier -> supervisor -> mode subagents -> aggregator."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from app.agents.classifier import classifier_node
from app.agents.state import TravelPlannerState
from app.agents.subagents.modes import MODE_NODES
from app.agents.supervisor import supervisor_node


def aggregator_node(state: TravelPlannerState) -> dict:
    # NOTE: options/notes/errors use operator.add reducers, so nodes must return
    # only DELTAS. Returning the full accumulated list would append it a 2nd time.
    # Sorting is a presentation concern -> done in run_chat(), not here.
    n = len(state.get("options", []))
    modes = ", ".join(state.get("selected_modes", [])) or "no modes"
    return {"notes": [f"Aggregated {n} option(s) across {modes}."]}


def _route_after_classifier(state: TravelPlannerState) -> str:
    return "followup" if state.get("needs_follow_up") else "supervisor"


def _guarded(mode: str):
    def node(state: TravelPlannerState) -> dict:
        if mode not in (state.get("selected_modes") or []):
            return {"options": [], "notes": [], "errors": []}
        return MODE_NODES[mode](state)

    node.__name__ = f"{mode}_guarded"
    return node


def build_graph():
    graph = StateGraph(TravelPlannerState)
    graph.add_node("classifier", classifier_node)
    graph.add_node("supervisor", supervisor_node)
    graph.add_node("aggregator", aggregator_node)
    for mode in MODE_NODES:
        graph.add_node(mode, _guarded(mode))

    graph.add_edge(START, "classifier")
    graph.add_conditional_edges("classifier", _route_after_classifier,
                                {"followup": END, "supervisor": "supervisor"})
    for mode in MODE_NODES:
        graph.add_edge("supervisor", mode)
        graph.add_edge(mode, "aggregator")
    graph.add_edge("aggregator", END)
    return graph.compile()


app_graph = build_graph()


def run_chat(message: str) -> dict:
    """Synchronous helper used by the API route and tests."""
    result = app_graph.invoke({"user_message": message})
    details = result.get("details")
    options = [o.model_dump() if hasattr(o, "model_dump") else o
               for o in result.get("options", [])]
    # Priced options first (presentation sort; state order is arrival order).
    options.sort(key=lambda o: (o.get("price_inr") is None, o.get("price_inr") or 0))
    return {
        "details": details.model_dump() if hasattr(details, "model_dump") else details,
        "missing_fields": result.get("missing_fields", []),
        "follow_up_questions": result.get("follow_up_questions", []),
        "needs_follow_up": result.get("needs_follow_up", False),
        "selected_modes": result.get("selected_modes", []),
        "options": options,
        "notes": result.get("notes", []),
        "errors": result.get("errors", []),
    }
