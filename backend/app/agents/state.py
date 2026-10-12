"""Shared state for the Destinify travel-agent graph.

Flow: user message -> classifier (typed extraction, kept in state) ->
supervisor -> mode subagents (train/flight/bus/cab/transit) -> aggregator.
"""

from __future__ import annotations

import operator
from typing import Annotated, Literal, TypedDict

from pydantic import BaseModel, Field

TravelMode = Literal["train", "flight", "bus", "cab", "transit"]
ALL_MODES: list[TravelMode] = ["train", "flight", "bus", "cab", "transit"]


class TravelDetails(BaseModel):
    """Typed extraction result kept in state (the 'typed API flow' contract)."""

    origin: str | None = Field(default=None, description="Origin city/station")
    destination: str | None = Field(default=None, description="Destination city/station")
    travel_date: str | None = Field(default=None, description="Travel date, YYYY-MM-DD if known")
    return_date: str | None = Field(default=None, description="Return date, YYYY-MM-DD if known")
    passengers: int = Field(default=1, description="Number of travellers")
    budget_inr: float | None = Field(default=None, description="Budget in INR if stated")
    preferred_modes: list[TravelMode] = Field(default_factory=list)
    intent: Literal["travel_search", "price_check", "booking_help", "other"] = "travel_search"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    raw_message: str = ""


REQUIRED_FIELDS: list[str] = ["origin", "destination"]


class TravelOption(BaseModel):
    mode: TravelMode
    title: str
    price_inr: float | None = None
    currency: str = "INR"
    duration_min: int | None = None
    provider: str | None = None
    source: Literal["rapidapi", "otd_delhi", "estimate", "llm"] = "estimate"
    details: dict = Field(default_factory=dict)
    note: str = ""


class TravelPlannerState(TypedDict, total=False):
    """LangGraph state. `details` is the classifier output kept for all nodes."""

    user_message: str
    details: TravelDetails
    missing_fields: list[str]
    follow_up_questions: list[str]
    needs_follow_up: bool
    selected_modes: list[TravelMode]
    options: Annotated[list[TravelOption], operator.add]
    notes: Annotated[list[str], operator.add]
    errors: Annotated[list[str], operator.add]
