"""Mode subagents: each queries its realtime tool, else returns a labelled estimate.

Every node has signature (state) -> dict and appends TravelOptions + notes.
No API keys are ever committed or echoed; tools read them from settings at runtime.
"""

from __future__ import annotations

import json

from app.agents.state import TravelOption, TravelPlannerState
from app.agents.tools.otd_delhi import fetch_vehicle_positions
from app.agents.tools.rapidapi import estimate_cab_fare


def _base(state: TravelPlannerState) -> tuple[str, str, str]:
    d = state.get("details")
    origin = (d.origin if d else None) or "Unknown"
    dest = (d.destination if d else None) or "Unknown"
    date = (d.travel_date if d else None) or ""
    return origin, dest, date


def train_agent_node(state: TravelPlannerState) -> dict:
    origin, dest, date = _base(state)
    options, notes, errors = [], [], []
    try:
        from app.agents.tools.rapidapi import search_trains

        raw = search_trains.invoke({"origin": origin, "destination": dest, "date": date})
        payload = json.loads(raw) if isinstance(raw, str) else raw
        if payload.get("status") == "unavailable":
            notes.append("Train realtime unavailable (no RAPID_API_KEY); estimate returned.")
            options.append(TravelOption(mode="train", title=f"Train {origin} → {dest}",
                                       provider="IRCTC (estimate)", source="estimate",
                                       note="Connect RapidAPI IRCTC host for live fares."))
        elif payload.get("status") == "error":
            errors.append(f"train tool: {payload.get('reason')}")
            options.append(TravelOption(mode="train", title=f"Train {origin} → {dest}",
                                       provider="IRCTC (estimate)", source="estimate",
                                       note="Live lookup failed; showing estimate."))
        else:
            options.append(TravelOption(mode="train", title=f"Train {origin} → {dest}",
                                       provider="RapidAPI train host", source="rapidapi",
                                       details=payload if isinstance(payload, dict) else {}))
    except Exception as e:  # noqa: BLE001
        errors.append(f"train agent: {e}")
    return {"options": options, "notes": notes, "errors": errors}


def flight_agent_node(state: TravelPlannerState) -> dict:
    origin, dest, date = _base(state)
    options, notes, errors = [], [], []
    try:
        from app.agents.tools.rapidapi import search_flight_airport, search_flights

        if not origin or not dest or origin == "Unknown":
            notes.append("Flight search needs origin/destination airport resolution first.")
            return {"options": options, "notes": notes, "errors": errors}
        # Resolve airports then search; each step degrades gracefully without a key.
        o_raw = search_flight_airport.invoke({"query": origin})
        d_raw = search_flight_airport.invoke({"query": dest})
        o_p, d_p = json.loads(o_raw), json.loads(d_raw)
        if o_p.get("status") == "unavailable":
            notes.append("Flight realtime unavailable (no RAPID_API_KEY); estimate returned.")
            options.append(TravelOption(mode="flight", title=f"Flight {origin} → {dest}",
                                       provider="Airline (estimate)", source="estimate",
                                       note="Connect RapidAPI sky-scrapper host for live fares."))
        else:
            raw = search_flights.invoke({"origin_sky_id": str(o_p)[:64],
                                         "dest_sky_id": str(d_p)[:64], "date": date})
            payload = json.loads(raw)
            if isinstance(payload, dict) and payload.get("status") == "error":
                errors.append(f"flight tool: {payload.get('reason')}")
                options.append(TravelOption(mode="flight", title=f"Flight {origin} → {dest}",
                                           provider="Airline (estimate)", source="estimate",
                                           note="Live lookup failed; showing estimate."))
            else:
                options.append(TravelOption(mode="flight", title=f"Flight {origin} → {dest}",
                                           provider="RapidAPI sky-scrapper", source="rapidapi",
                                           details=payload if isinstance(payload, dict) else {}))
    except Exception as e:  # noqa: BLE001
        errors.append(f"flight agent: {e}")
    return {"options": options, "notes": notes, "errors": errors}


def bus_agent_node(state: TravelPlannerState) -> dict:
    origin, dest, date = _base(state)
    options, notes, errors = [], [], []
    try:
        from app.agents.tools.rapidapi import search_buses

        raw = search_buses.invoke({"origin": origin, "destination": dest, "date": date})
        payload = json.loads(raw) if isinstance(raw, str) else raw
        if payload.get("status") == "unavailable":
            notes.append("Bus realtime unavailable (no RAPID_API_KEY); estimate returned.")
            options.append(TravelOption(mode="bus", title=f"Bus {origin} → {dest}",
                                       provider="State/Private operator (estimate)",
                                       source="estimate"))
        elif payload.get("status") == "error":
            errors.append(f"bus tool: {payload.get('reason')}")
            options.append(TravelOption(mode="bus", title=f"Bus {origin} → {dest}",
                                       provider="State/Private operator (estimate)",
                                       source="estimate",
                                       note="Live lookup failed; showing estimate."))
        else:
            options.append(TravelOption(mode="bus", title=f"Bus {origin} → {dest}",
                                       provider="RapidAPI bus host", source="rapidapi",
                                       details=payload if isinstance(payload, dict) else {}))
    except Exception as e:  # noqa: BLE001
        errors.append(f"bus agent: {e}")
    return {"options": options, "notes": notes, "errors": errors}


def cab_agent_node(state: TravelPlannerState) -> dict:
    origin, dest, _ = _base(state)
    options, notes, errors = [], [], []
    try:
        raw = estimate_cab_fare.invoke({"origin": origin, "destination": dest, "distance_km": 0})
        payload = json.loads(raw)
        fares = payload.get("fares_inr", {})
        for label, fare in fares.items():
            options.append(TravelOption(mode="cab", title=f"Cab ({label}) {origin} → {dest}",
                                       price_inr=float(fare), provider="Cab estimate",
                                       source="estimate",
                                       details={"distance_km": payload.get("distance_km")}))
        notes.append("Cab fares are per-km estimates until a RapidAPI cab provider is wired.")
    except Exception as e:  # noqa: BLE001
        errors.append(f"cab agent: {e}")
    return {"options": options, "notes": notes, "errors": errors}


def transit_agent_node(state: TravelPlannerState) -> dict:
    """Delhi intra-city realtime via OTD GTFS-RT feed."""
    options, notes, errors = [], [], []
    try:
        feed = fetch_vehicle_positions()
        if feed.get("status") == "ok":
            options.append(TravelOption(
                mode="transit", title="Delhi live transit (OTD feed)",
                provider="OTD Delhi", source="otd_delhi",
                details={"vehicles_total": feed.get("vehicles_total"),
                         "routes_active": feed.get("routes_active"),
                         "top_routes": feed.get("top_routes", [])},
                note=f"{feed.get('vehicles_total')} live vehicles across "
                     f"{feed.get('routes_active')} routes."))
        elif feed.get("status") == "unavailable":
            notes.append("Delhi realtime unavailable (no OTD_DELHI_API key set).")
        else:
            errors.append(f"transit tool: {feed.get('reason')}")
    except Exception as e:  # noqa: BLE001
        errors.append(f"transit agent: {e}")
    return {"options": options, "notes": notes, "errors": errors}


MODE_NODES = {
    "train": train_agent_node,
    "flight": flight_agent_node,
    "bus": bus_agent_node,
    "cab": cab_agent_node,
    "transit": transit_agent_node,
}
