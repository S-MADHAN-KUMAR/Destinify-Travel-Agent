"""Offline tests for the travel-agent graph (no API keys / network required)."""

from app.agents.classifier import classifier_node, heuristic_extract
from app.agents.graph import run_chat
from app.agents.supervisor import supervisor_node


def test_heuristic_extracts_origin_destination():
    d = heuristic_extract("I want to go from Delhi to Jaipur on 2026-12-25, 2 people")
    assert d.origin == "Delhi"
    assert d.destination == "Jaipur"
    assert d.travel_date == "2026-12-25"
    assert d.passengers == 2


def test_classifier_flags_missing_destination():
    out = classifier_node({"user_message": "I want to travel somewhere"})
    assert out["needs_follow_up"] is True
    assert "destination" in out["missing_fields"]
    assert len(out["follow_up_questions"]) >= 1


def test_supervisor_selects_all_modes_by_default():
    out = supervisor_node({"details": heuristic_extract("from Delhi to Jaipur")})
    assert set(out["selected_modes"]) == {"train", "flight", "bus", "cab", "transit"}


def test_supervisor_honours_preferred_modes():
    out = supervisor_node({"details": heuristic_extract("flight from Delhi to Mumbai")})
    assert out["selected_modes"] == ["flight"]


def test_run_chat_follow_up_when_incomplete():
    res = run_chat("hello, I want to travel")
    assert res["needs_follow_up"] is True
    assert res["follow_up_questions"]


def test_run_chat_full_message_returns_options_without_keys():
    res = run_chat("Find trains and buses from Delhi to Jaipur")
    assert res["needs_follow_up"] is False
    assert res["details"]["origin"] == "Delhi"
    assert {"train", "bus"} <= set(res["selected_modes"])
    assert len(res["options"]) >= 2  # estimates, no keys needed
