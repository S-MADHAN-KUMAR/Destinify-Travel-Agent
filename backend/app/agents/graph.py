"""LangGraph assembly for the all-in-one trip agent (with memory).

    START -> memory_loader -> classifier
        -> (needs follow-up?) ask -> memory_saver -> END
        -> (conversational turn?) chat -> memory_saver -> END
        -> supervisor -> [attractions / food / stay / transport] (parallel fan-out)
        -> planner -> memory_saver -> END

Research nodes only run for capabilities the supervisor selected (guarded), and
the planner joins all of them into one TripPlan.
"""

from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph

from app.agents.chat import chat_node
from app.agents.classifier import classifier_node
from app.agents.memory import (
    append_turn,
    load_memory,
    save_memory,
    update_long_memory,
)
from app.agents.planner import planner_node
from app.agents.state import (
    LongMemory,
    MemoryPayload,
    TravelPlannerState,
)
from app.agents.subagents.research import RESEARCH_NODES
from app.agents.supervisor import supervisor_node

logger = logging.getLogger(__name__)


def memory_loader(state: TravelPlannerState) -> dict:
    """Merge client (localStorage) memory with any server-side copy for this session."""
    session_id = state.get("session_id", "default")
    incoming = MemoryPayload(
        short=state.get("short_memory", []),
        long=state.get("long_memory") or LongMemory(),
    )
    payload = load_memory(session_id, incoming)
    return {"short_memory": payload.short, "long_memory": payload.long}


def ask_node(state: TravelPlannerState) -> dict:
    """Formulate a friendly follow-up reply (instead of a bare field list)."""
    questions = state.get("follow_up_questions", [])
    lead = questions[0] if questions else "I need a little more to go on."
    text = ("\n".join(f"• {q}" for q in questions)
            if len(questions) > 1 else
            "Tell me that and I'll put together the full plan.")
    return {"reply_lead": lead, "reply_text": text, "notes": ["Awaiting missing trip details."]}


def memory_saver(state: TravelPlannerState) -> dict:
    """Fold this turn into long/short memory and return the payload to persist."""
    session_id = state.get("session_id", "default")
    details = state.get("details")
    long = update_long_memory(state.get("long_memory") or LongMemory(), details)
    trip = state.get("trip_plan")
    summary = state.get("reply_text") or (f"Discussed a trip to {details.destination}." if details else "General chat.")
    if trip:
        summary = f"Planned {trip.days} days in {trip.destination}."
    summary = " ".join(summary.split())[:180]  # keep short-term memory compact
    short = append_turn(state.get("short_memory", []), state.get("user_message", ""), summary)
    payload = MemoryPayload(short=short, long=long)
    save_memory(session_id, payload)
    return {"short_memory": short, "long_memory": long}


def _guarded(capability: str):
    def node(state: TravelPlannerState) -> dict:
        if capability not in (state.get("capabilities") or []):
            # Return empty deltas so reducers stay consistent.
            empty: dict = {"notes": [], "errors": []}
            if capability == "attractions":
                empty["attractions"] = []
            elif capability == "food":
                empty["restaurants"] = []
            elif capability == "stay":
                empty["hotels"] = []
            elif capability == "transport":
                empty["transport_options"] = []
            return empty
        return RESEARCH_NODES[capability](state)

    node.__name__ = f"{capability}_guarded"
    return node


def _route_after_classifier(state: TravelPlannerState) -> str:
    if state.get("needs_follow_up"):
        return "ask"
    details = state.get("details")
    if details is not None and details.intent == "general":
        return "chat"  # conversational turn: answer from memory, don't re-plan
    return "supervisor"


def build_graph():
    graph = StateGraph(TravelPlannerState)
    graph.add_node("memory_loader", memory_loader)
    graph.add_node("classifier", classifier_node)
    graph.add_node("ask", ask_node)
    graph.add_node("chat", chat_node)
    graph.add_node("supervisor", supervisor_node)
    graph.add_node("planner", planner_node)
    graph.add_node("memory_saver", memory_saver)
    for capability in RESEARCH_NODES:
        graph.add_node(capability, _guarded(capability))

    graph.add_edge(START, "memory_loader")
    graph.add_edge("memory_loader", "classifier")
    graph.add_conditional_edges(
        "classifier", _route_after_classifier,
        {"ask": "ask", "chat": "chat", "supervisor": "supervisor"})
    graph.add_edge("ask", "memory_saver")
    graph.add_edge("chat", "memory_saver")

    # Fan-out/fan-in: supervisor -> capability nodes -> planner (the planner is
    # the join point, so it waits for every selected research node to finish).
    for capability in RESEARCH_NODES:
        graph.add_edge("supervisor", capability)
        graph.add_edge(capability, "planner")
    graph.add_edge("planner", "memory_saver")
    graph.add_edge("memory_saver", END)
    return graph.compile()


app_graph = build_graph()


def _dump(obj):
    return obj.model_dump() if hasattr(obj, "model_dump") else obj


def run_chat(message: str, memory: MemoryPayload | None = None,
             session_id: str = "default") -> dict:
    """Run the graph for one user turn (sync). Returns reply + plan + memory."""
    result = app_graph.invoke(_initial_state(message, memory, session_id))
    return _respond(result)


async def arun_chat(message: str, memory: MemoryPayload | None = None,
                    session_id: str = "default") -> dict:
    """Async variant — the API uses this so the research fan-out runs in
    parallel (attractions/food/stay/transport) instead of one after another."""
    result = await app_graph.ainvoke(_initial_state(message, memory, session_id))
    return _respond(result)


def _initial_state(message: str, memory: MemoryPayload | None,
                   session_id: str) -> TravelPlannerState:
    memory = memory or MemoryPayload()
    return {
        "session_id": session_id,
        "user_message": message,
        "short_memory": memory.short,
        "long_memory": memory.long,
    }


def _respond(result: dict) -> dict:
    details = result.get("details")
    trip = result.get("trip_plan")
    updated_memory = MemoryPayload(
        short=result.get("short_memory", []),
        long=result.get("long_memory") or LongMemory(),
    )

    # Lightweight "tools" trace so the UI can animate what was researched.
    caps = result.get("capabilities", [])
    tools = [{"label": label, "detail": detail} for label, detail in _tool_trace(result, caps)]

    return {
        "reply_lead": result.get("reply_lead", ""),
        "reply_text": result.get("reply_text", ""),
        "details": _dump(details) if details else {},
        "trip_plan": _dump(trip) if trip else None,
        "memory": _dump(updated_memory),
        "needs_follow_up": result.get("needs_follow_up", False),
        "follow_up_questions": result.get("follow_up_questions", []),
        "capabilities": caps,
        "tools": tools,
        "notes": result.get("notes", []),
        "errors": result.get("errors", []),
    }


def _tool_trace(result: dict, caps: list[str]) -> list[tuple[str, str]]:
    trace: list[tuple[str, str]] = []
    mapping = {
        "attractions": ("Mapped attractions", "attractions"),
        "food": ("Found restaurants", "restaurants"),
        "stay": ("Found stays", "hotels"),
        "transport": ("Compared transport", "transport_options"),
    }
    for cap in caps:
        label, key = mapping.get(cap, (cap, ""))
        items = result.get(key, []) if key else []
        detail = f"{len(items)} found" if items else "none found"
        trace.append((label, detail))
    return trace
