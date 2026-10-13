"""Shared state for the Destinify travel-agent graph.

Flow (supervisor pattern with memory):
  user message + memory -> memory_loader -> classifier (typed extraction) ->
  [needs follow-up? END] -> supervisor -> research fan-out
  (attractions / restaurants / hotels / transport) -> planner (day-by-day) ->
  memory_saver -> END.

The whole "all-in-one trip" contract lives here as Pydantic models so every
node agrees on one typed shape. Nothing here talks to the network.
"""

from __future__ import annotations

import operator
from typing import Annotated, Literal, TypedDict

from pydantic import BaseModel, Field

TravelMode = Literal["flight", "train", "bus", "cab", "metro", "walk"]
ALL_MODES: list[TravelMode] = ["flight", "train", "bus", "cab", "metro", "walk"]

# Which research capabilities the supervisor can fan out to.
Capability = Literal["attractions", "food", "stay", "transport"]
ALL_CAPABILITIES: list[Capability] = ["attractions", "food", "stay", "transport"]

TripIntent = Literal["trip_plan", "transport_search", "food_search", "stay_search", "general"]


# --------------------------------------------------------------------------- #
# Memory                                                                      #
# --------------------------------------------------------------------------- #

class ShortMemoryTurn(BaseModel):
    """One recent user/agent exchange kept as short-term memory."""

    role: Literal["user", "agent"] = "user"
    text: str = ""


class LongMemory(BaseModel):
    """Durable user profile accumulated across sessions (persisted in localStorage)."""

    home_city: str | None = None
    interests: list[str] = Field(default_factory=list)
    budget_style: Literal["budget", "mid", "luxury", "unknown"] = "unknown"
    preferred_modes: list[TravelMode] = Field(default_factory=list)
    past_destinations: list[str] = Field(default_factory=list)
    travellers: int | None = None
    notes: str = ""


class MemoryPayload(BaseModel):
    """Memory the frontend round-trips with every request (localStorage-backed)."""

    short: list[ShortMemoryTurn] = Field(default_factory=list)
    long: LongMemory = Field(default_factory=LongMemory)


# --------------------------------------------------------------------------- #
# Typed extraction                                                            #
# --------------------------------------------------------------------------- #

class TravelDetails(BaseModel):
    """Typed extraction result kept in state (the typed contract the graph runs on)."""

    origin: str | None = Field(default=None, description="Origin city/station/airport")
    destination: str | None = Field(default=None, description="Destination city/region")
    days: int | None = Field(default=None, description="Trip length in days if stated (e.g. '3 day trip' -> 3)")
    start_date: str | None = Field(default=None, description="Start date YYYY-MM-DD if known")
    end_date: str | None = Field(default=None, description="Return/end date YYYY-MM-DD if known")
    travellers: int = Field(default=1, description="Number of travellers")
    budget_inr: float | None = Field(default=None, description="Total budget in INR if stated")
    interests: list[str] = Field(default_factory=list, description="e.g. food, culture, nature, nightlife, history, adventure, beach")
    pace: Literal["relaxed", "balanced", "packed"] = Field(default="balanced")
    trip_type: str = Field(default="", description="leisure|adventure|food|culture|beach|mountain honeymoon|family ...")
    intent: TripIntent = "trip_plan"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    raw_message: str = ""


# --------------------------------------------------------------------------- #
# Research results (real data from free sources, enriched by LLM)             #
# --------------------------------------------------------------------------- #

class GeoPoint(BaseModel):
    lat: float
    lon: float
    label: str = ""


class Place(BaseModel):
    """A tourist attraction / notable place."""

    name: str
    category: str = "attraction"
    lat: float | None = None
    lon: float | None = None
    image_url: str | None = None
    description: str = ""
    rating: float | None = None
    price_level: str | None = None
    opening_hours: str | None = None
    wiki_url: str | None = None
    source: Literal["osm", "wikipedia", "yelp", "llm", "estimate"] = "osm"


class Restaurant(BaseModel):
    name: str
    cuisine: str = ""
    lat: float | None = None
    lon: float | None = None
    image_url: str | None = None
    price_level: str | None = None
    rating: float | None = None
    description: str = ""
    source: Literal["osm", "yelp", "wikipedia", "llm", "estimate"] = "osm"


class Hotel(BaseModel):
    name: str
    lat: float | None = None
    lon: float | None = None
    image_url: str | None = None
    price_inr: float | None = None
    rating: float | None = None
    description: str = ""
    amenities: list[str] = Field(default_factory=list)
    source: Literal["osm", "amadeus", "llm", "estimate"] = "osm"


class TransportOption(BaseModel):
    mode: TravelMode
    title: str
    price_inr: float | None = None
    currency: str = "INR"
    duration_min: int | None = None
    provider: str | None = None
    departure: str | None = None
    arrival: str | None = None
    image_url: str | None = None
    source: Literal["rapidapi", "amadeus", "otd_delhi", "estimate", "llm"] = "estimate"
    details: dict = Field(default_factory=dict)
    note: str = ""


class Research(BaseModel):
    """Everything the research agents found, consumed by the planner."""

    origin_geo: GeoPoint | None = None
    destination_geo: GeoPoint | None = None
    attractions: list[Place] = Field(default_factory=list)
    restaurants: list[Restaurant] = Field(default_factory=list)
    hotels: list[Hotel] = Field(default_factory=list)
    transport: list[TransportOption] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# The day-by-day trip plan                                                    #
# --------------------------------------------------------------------------- #

class DayActivity(BaseModel):
    """One slot in a day (morning / afternoon / evening) anchored to a real place."""

    slot: Literal["morning", "afternoon", "evening"] = "morning"
    title: str
    place: str = ""
    lat: float | None = None
    lon: float | None = None
    image_url: str | None = None
    description: str = ""
    duration_hours: float | None = None


class DayMeals(BaseModel):
    breakfast: str | None = None
    lunch: str | None = None
    dinner: str | None = None


class DayPlan(BaseModel):
    day: int
    date: str | None = None
    theme: str = ""
    activities: list[DayActivity] = Field(default_factory=list)
    meals: DayMeals = Field(default_factory=DayMeals)
    stay: str | None = None
    transport: str | None = None
    summary: str = ""


class BudgetBreakdown(BaseModel):
    transport_inr: float = 0.0
    stay_inr: float = 0.0
    food_inr: float = 0.0
    activities_inr: float = 0.0
    misc_inr: float = 0.0
    total_inr: float = 0.0
    currency: str = "INR"
    note: str = ""


class MapPin(BaseModel):
    lat: float
    lon: float
    label: str
    kind: Literal["origin", "destination", "attraction", "restaurant", "hotel", "activity"] = "attraction"
    day: int | None = None
    image_url: str | None = None


class TripPlan(BaseModel):
    """The all-in-one deliverable: route + days + stays + food + places + budget + map."""

    destination: str = ""
    origin: str | None = None
    days: int = 0
    travellers: int = 1
    route_summary: str = ""
    itinerary: list[DayPlan] = Field(default_factory=list)
    attractions: list[Place] = Field(default_factory=list)
    restaurants: list[Restaurant] = Field(default_factory=list)
    hotels: list[Hotel] = Field(default_factory=list)
    transport: list[TransportOption] = Field(default_factory=list)
    budget: BudgetBreakdown = Field(default_factory=BudgetBreakdown)
    map_center: GeoPoint | None = None
    origin_geo: GeoPoint | None = None
    map_pins: list[MapPin] = Field(default_factory=list)
    highlights: list[str] = Field(default_factory=list)
    tips: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# LangGraph state                                                             #
# --------------------------------------------------------------------------- #

class TravelPlannerState(TypedDict, total=False):
    """LangGraph state. Reducer fields accumulate as deltas via operator.add."""

    session_id: str
    user_message: str
    short_memory: list[ShortMemoryTurn]
    long_memory: LongMemory
    details: TravelDetails
    research: Research
    origin_geo: GeoPoint
    destination_geo: GeoPoint
    # Research results accumulate per-capability (operator.add reducers) and are
    # assembled into `research` by the planner.
    attractions: Annotated[list[Place], operator.add]
    restaurants: Annotated[list[Restaurant], operator.add]
    hotels: Annotated[list[Hotel], operator.add]
    transport_options: Annotated[list[TransportOption], operator.add]
    trip_plan: TripPlan
    reply_lead: str
    reply_text: str
    capabilities: list[Capability]
    missing_fields: list[str]
    follow_up_questions: list[str]
    needs_follow_up: bool
    # Legacy transport-only option list kept for backwards compatibility.
    options: Annotated[list[TransportOption], operator.add]
    notes: Annotated[list[str], operator.add]
    errors: Annotated[list[str], operator.add]
