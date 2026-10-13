"""Offline tests for the all-in-one trip agent (no network / API keys required).

The network-backed research tools and the LLM are stubbed so the suite runs fast
and deterministically, while still exercising the real graph wiring, memory,
classifier follow-up logic and the planner.
"""

from __future__ import annotations

from app.agents import classifier as classifier_mod
from app.agents import planner as planner_mod
from app.agents.tools import transport as transport_mod
from app.agents.classifier import classifier_node, heuristic_extract
from app.agents.graph import run_chat
from app.agents.memory import (
    MemoryPayload,
    append_turn,
    load_memory,
    update_long_memory,
)
from app.agents.state import (
    GeoPoint,
    Hotel,
    LongMemory,
    Place,
    Restaurant,
    Research,
    TravelDetails,
)
from app.agents.subagents import research as research_mod
from app.agents.tools import geo as geo_mod
from app.agents.supervisor import supervisor_node

# --------------------------------------------------------------------------- #
# Helpers: canned geodata so nothing touches the network                      #
# --------------------------------------------------------------------------- #

_CITY_GEO = {
    "jaipur": {"lat": 26.91, "lon": 75.81, "city": "Jaipur", "display_name": "Jaipur, India"},
    "delhi": {"lat": 28.61, "lon": 77.20, "city": "Delhi", "display_name": "Delhi, India"},
    "paris": {"lat": 48.85, "lon": 2.35, "city": "Paris", "display_name": "Paris, France"},
}


def _fake_geocode(query: str):
    return _CITY_GEO.get(query.strip().lower())


def _places(city: str) -> list[Place]:
    base = _CITY_GEO[city.lower()]
    names = [f"{city} Landmark {i}" for i in range(6)]
    return [
        Place(name=n, category="attraction", lat=base["lat"] + i * 0.01,
              lon=base["lon"] + i * 0.01, image_url=f"https://img.example/{i}.jpg")
        for i, n in enumerate(names)
    ]


def _restaurants(city: str) -> list[Restaurant]:
    base = _CITY_GEO[city.lower()]
    return [
        Restaurant(name=f"{city} Kitchen {i}", cuisine="Indian",
                   lat=base["lat"] + i * 0.005, lon=base["lon"] + i * 0.005,
                   image_url=f"https://food.example/{i}.jpg")
        for i in range(5)
    ]


def _hotels(city: str) -> list[Hotel]:
    base = _CITY_GEO[city.lower()]
    return [
        Hotel(name=f"{city} Stay {i}", lat=base["lat"], lon=base["lon"],
              price_inr=2500.0, image_url=f"https://hotel.example/{i}.jpg")
        for i in range(3)
    ]


def _stub_network(monkeypatch, cities=("Jaipur", "Delhi")):
    monkeypatch.setattr(geo_mod, "geocode", _fake_geocode)
    monkeypatch.setattr(geo_mod, "search_attractions",
                        lambda city, limit=16: (_places(city), []))
    monkeypatch.setattr(geo_mod, "search_restaurants",
                        lambda city, limit=14: (_restaurants(city), []))
    monkeypatch.setattr(geo_mod, "search_hotels", lambda city, limit=12: (_hotels(city), []))
    monkeypatch.setattr(geo_mod, "food_image", lambda *a, **k: "https://food.example/x.jpg")
    # transport module imports geocode directly and calls live search
    monkeypatch.setattr("app.agents.tools.transport.geocode", _fake_geocode)
    monkeypatch.setattr("app.agents.tools.transport.live_flight_options", lambda *a, **k: [])
    # research node uses geo.food_image via geo module
    monkeypatch.setattr(research_mod.geo, "geocode", _fake_geocode)


def _stub_llm(monkeypatch):
    """Force the offline (heuristic classifier + fallback planner) path."""
    monkeypatch.setattr(classifier_mod, "get_llm", lambda: None)
    monkeypatch.setattr(planner_mod, "get_llm", lambda: None)


# --------------------------------------------------------------------------- #
# Classifier heuristics (offline, no stubbing needed)                         #
# --------------------------------------------------------------------------- #

def test_heuristic_extracts_trip_details():
    d = heuristic_extract("I want to go from Delhi to Jaipur on 2026-12-25, 2 people")
    assert d.origin == "Delhi"
    assert d.destination == "Jaipur"
    assert d.start_date == "2026-12-25"
    assert d.travellers == 2


def test_heuristic_extracts_days_and_destination():
    d = heuristic_extract("Plan a 3 day trip to Paris")
    assert d.destination == "Paris"
    assert d.days == 3
    assert d.intent == "trip_plan"


def test_classifier_follows_up_when_no_destination(monkeypatch):
    _stub_llm(monkeypatch)
    out = classifier_node({"user_message": "I want to travel somewhere nice"})
    assert out["needs_follow_up"] is True
    assert "destination" in out["missing_fields"]


def test_classifier_proceeds_with_destination_only(monkeypatch):
    _stub_llm(monkeypatch)
    out = classifier_node({"user_message": "Plan a 3 day trip to Paris"})
    assert out["needs_follow_up"] is False
    assert out["details"].destination == "Paris"


def test_classifier_uses_home_city_from_memory(monkeypatch):
    _stub_llm(monkeypatch)
    out = classifier_node({
        "user_message": "Plan a 3 day trip to Paris",
        "long_memory": LongMemory(home_city="Delhi"),
    })
    assert out["details"].origin == "Delhi"  # filled from long-term memory


# --------------------------------------------------------------------------- #
# Memory                                                                      #
# --------------------------------------------------------------------------- #

def test_update_long_memory_accumulates_profile():
    long = LongMemory()
    long = update_long_memory(long, TravelDetails(destination="Jaipur", travellers=2,
                                                  budget_inr=20000, interests=["food"]))
    assert "Jaipur" in long.past_destinations
    assert "food" in long.interests
    assert long.travellers == 2
    assert long.budget_style == "budget"  # 10k per head


def test_append_turn_is_rolling():
    short = append_turn([], "hi", "hello")
    short = append_turn(short, "again", "sure")
    assert len(short) == 4
    assert short[-1].role == "agent"


def test_load_memory_merges_server_side():
    load_memory("sess1", MemoryPayload(long=LongMemory(home_city="Delhi")))
    merged = load_memory("sess1", MemoryPayload())
    assert merged.long.home_city == "Delhi"


# --------------------------------------------------------------------------- #
# Supervisor + transport estimates                                            #
# --------------------------------------------------------------------------- #

def test_supervisor_selects_all_for_trip_plan():
    out = supervisor_node({"details": TravelDetails(destination="Paris", intent="trip_plan")})
    assert set(out["capabilities"]) == {"attractions", "food", "stay", "transport"}


def test_supervisor_selects_subset_for_food():
    out = supervisor_node({"details": TravelDetails(destination="Paris", intent="food_search")})
    assert "food" in out["capabilities"]
    assert "transport" not in out["capabilities"]


def test_estimate_transport_is_distance_based():
    opts = transport_mod.estimate_transport("Delhi", "Jaipur", 280.0, None)
    modes = {o.mode for o in opts}
    assert "train" in modes and "bus" in modes
    prices = {o.mode: o.price_inr for o in opts}
    assert all(p and p > 0 for p in prices.values())


def test_route_distance_differs_by_city():
    d1 = transport_mod.route_distance_km("Delhi", "Jaipur")
    assert d1 is not None  # geocode stubbed


# --------------------------------------------------------------------------- #
# Planner (offline fallback)                                                  #
# --------------------------------------------------------------------------- #

def test_planner_fallback_builds_full_plan():
    details = TravelDetails(destination="Jaipur", days=3, travellers=2)
    research = Research(
        destination_geo=GeoPoint(lat=26.91, lon=75.81, label="Jaipur"),
        attractions=_places("Jaipur"), restaurants=_restaurants("Jaipur"),
        hotels=_hotels("Jaipur"),
        transport=transport_mod.estimate_transport("Delhi", "Jaipur", 280.0, None),
    )
    plan = planner_mod.plan_itinerary(details, research, "")
    trip = planner_mod.assemble_trip_plan(details, research, plan)
    assert trip.days == 3
    assert len(trip.itinerary) == 3
    assert trip.budget.total_inr > 0
    assert len(trip.map_pins) > 0
    assert trip.map_center is not None


# --------------------------------------------------------------------------- #
# Full graph (network + LLM stubbed)                                          #
# --------------------------------------------------------------------------- #

def test_run_chat_builds_trip_plan(monkeypatch):
    _stub_network(monkeypatch)
    _stub_llm(monkeypatch)
    res = run_chat("Plan a 3 day trip to Jaipur", MemoryPayload(), "s1")
    assert res["needs_follow_up"] is False
    assert res["trip_plan"] is not None
    assert res["trip_plan"]["days"] == 3
    assert len(res["trip_plan"]["itinerary"]) == 3
    # memory is updated and returned for persistence
    assert "Jaipur" in res["memory"]["long"]["past_destinations"]
    assert len(res["memory"]["short"]) == 2


def test_run_chat_follow_up_keeps_memory(monkeypatch):
    _stub_network(monkeypatch)
    _stub_llm(monkeypatch)
    res = run_chat("somewhere warm maybe", MemoryPayload(), "s2")
    assert res["needs_follow_up"] is True
    assert res["follow_up_questions"]


def test_run_chat_different_cities_differ(monkeypatch):
    _stub_network(monkeypatch)
    _stub_llm(monkeypatch)
    a = run_chat("Plan a 3 day trip to Jaipur", MemoryPayload(), "a")
    b = run_chat("Plan a 3 day trip to Delhi", MemoryPayload(), "b")
    assert a["trip_plan"]["destination"] == "Jaipur"
    assert b["trip_plan"]["destination"] == "Delhi"
    assert a["trip_plan"]["itinerary"][0]["activities"] != b["trip_plan"]["itinerary"][0]["activities"]


def test_run_chat_uses_memory_across_turns(monkeypatch):
    _stub_network(monkeypatch)
    _stub_llm(monkeypatch)
    first = run_chat("I'm from Delhi. Plan a 3 day trip to Jaipur", MemoryPayload(), "m1")
    # second turn: memory now carries Delhi as home city; user omits origin
    mem = MemoryPayload(short=first["memory"]["short"], long=LongMemory(**first["memory"]["long"]))
    second = run_chat("Now plan a 2 day trip to Paris", mem, "m1")
    assert second["details"]["origin"] == "Delhi"  # recalled home city from memory
