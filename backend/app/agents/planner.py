"""Planner agent: turn real research into a day-by-day trip plan + budget + map.

The LLM sequences the REAL places/restaurants/hotels the research agents found
(it chooses by index, so nothing is hallucinated and every pin has true
lat/lon/images). A deterministic fallback builds a solid plan when no LLM key
is configured, so the feature never depends on the network.
"""

from __future__ import annotations

import logging
import math
from datetime import date, timedelta

from pydantic import BaseModel, Field

from app.agents.classifier import get_llm
from app.agents.memory import memory_context
from app.agents.state import (
    BudgetBreakdown,
    DayActivity,
    DayMeals,
    DayPlan,
    GeoPoint,
    MapPin,
    Research,
    TravelDetails,
    TravelPlannerState,
    TripPlan,
)
from app.core.config import settings

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# LLM-facing itinerary schema (chooses from real, indexed lists)              #
# --------------------------------------------------------------------------- #

class DayPick(BaseModel):
    day: int
    theme: str = Field(default="", description="Short theme for the day, e.g. 'Old City & palaces'")
    morning: int | None = Field(default=None, description="Index into the attractions list")
    afternoon: int | None = Field(default=None, description="Index into the attractions list")
    evening: int | None = Field(default=None, description="Index into the attractions list (or null)")
    lunch: int | None = Field(default=None, description="Index into the restaurants list (or null)")
    dinner: int | None = Field(default=None, description="Index into the restaurants list (or null)")
    summary: str = Field(default="", description="1-2 sentence plan for the day")


class PlannerOutput(BaseModel):
    days: list[DayPick]
    highlights: list[str] = Field(default_factory=list, description="3-5 trip highlights")
    tips: list[str] = Field(default_factory=list, description="3-4 practical tips")


PLANNER_SYSTEM = """You are an expert travel planner. Given a numbered list of REAL attractions,
restaurants, and hotels for a destination, build a realistic day-by-day itinerary.

Rules:
- Cover each requested day (1..N). Put famous/morning-friendly sights in the morning,
  museums/markets in the afternoon, viewpoints/dining in the evening.
- Reference places ONLY by their integer index from the provided lists. Never invent places.
- Prefer the famous, must-see sights. Skip minor gates, office/town-hall buildings, random
  statues and anything a visitor would not travel for — unless the list offers nothing better.
- Never repeat the same attraction on two different days; spread the list across the trip.
- Choose a lunch and dinner restaurant per day from the restaurant list when available.
- Keep each day geographically coherent when possible (don't zig-zag the city).
- Write a short theme and a 1-2 sentence summary per day.
- Add 3-5 highlights and 3-4 practical tips.
- Respect the traveller's interests and pace if implied."""


def _index_map(items: list, key: str = "name") -> dict[int, object]:
    return {i: item for i, item in enumerate(items)}


def build_planner_prompt(details: TravelDetails, research: Research, ctx: str) -> list[dict]:
    att = [f"{i}. {p.name} ({p.category})" for i, p in enumerate(research.attractions)]
    rest = [f"{i}. {r.name} ({r.cuisine})" for i, r in enumerate(research.restaurants)]
    stay = [f"{i}. {h.name}" for i, h in enumerate(research.hotels)]
    days = details.days or 3
    lines = [
        f"Destination: {details.destination}.",
        f"Trip length: {days} days. Travellers: {details.travellers}. Pace: {details.pace}.",
    ]
    if details.interests:
        lines.append(f"Interests: {', '.join(details.interests)}.")
    if details.trip_type:
        lines.append(f"Trip style: {details.trip_type}.")
    if ctx:
        lines.append(f"About the traveller:\n{ctx}")
    lines.append("\nATTRACTIONS (index: name):")
    lines.extend(att or ["(none)"])
    lines.append("\nRESTAURANTS (index: name):")
    lines.extend(rest or ["(none)"])
    lines.append("\nSTAYS (index: name):")
    lines.extend(stay or ["(none)"])
    lines.append(f"\nReturn an itinerary covering days 1..{days}.")
    return [
        {"role": "system", "content": PLANNER_SYSTEM},
        {"role": "user", "content": "\n".join(lines)},
    ]


# --------------------------------------------------------------------------- #
# Deterministic fallback                                                      #
# --------------------------------------------------------------------------- #

def _fallback_output(details: TravelDetails, research: Research) -> PlannerOutput:
    days = details.days or 3
    n_att = len(research.attractions)
    picks: list[DayPick] = []
    for d in range(days):
        base = d * 3
        morning = research.attractions[base % n_att].name if n_att else None
        # pick by index for the LLM-less path too (indices into real lists)
        m_idx = base % n_att if n_att else None
        a_idx = (base + 1) % n_att if n_att else None
        e_idx = (base + 2) % n_att if n_att else None
        lunch = (d * 2) % len(research.restaurants) if research.restaurants else None
        dinner = (d * 2 + 1) % len(research.restaurants) if research.restaurants else None
        picks.append(DayPick(
            day=d + 1,
            theme=f"Day {d + 1} in {details.destination}",
            morning=m_idx, afternoon=a_idx, evening=e_idx,
            lunch=lunch, dinner=dinner,
            summary=f"Explore {morning or details.destination} and nearby highlights at a {details.pace} pace.",
        ))
    return PlannerOutput(
        days=picks,
        highlights=[p.name for p in research.attractions[:4]],
        tips=["Start early to beat the crowds.",
              "Keep cash for small eateries and entry tickets.",
              "Confirm opening hours before you go."],
    )


# --------------------------------------------------------------------------- #
# Assembly: indices -> real objects, budget, map pins                         #
# --------------------------------------------------------------------------- #

_STAY_DEFAULT = {"budget": 1500.0, "mid": 3500.0, "luxury": 8000.0}
_FOOD_PER_DAY = {"budget": 900.0, "mid": 2000.0, "luxury": 4500.0}


def _budget_style_from(details: TravelDetails) -> str:
    if not details.budget_inr:
        return "mid"
    per = details.budget_inr / max(1, details.travellers)
    return "budget" if per < 15000 else ("mid" if per < 60000 else "luxury")


def _build_budget(details: TravelDetails, research: Research) -> BudgetBreakdown:
    travellers = details.travellers or 1
    days = details.days or 3
    nights = max(1, days - 1)
    style = _budget_style_from(details)

    transport_inr = 0.0
    # Intercity travel only — local getting-around fares aren't the trip's travel budget.
    priced = [o.price_inr for o in research.transport
              if o.price_inr and o.details.get("scope") != "local"]
    if priced:
        transport_inr = min(priced) * travellers
    else:
        transport_inr = 3000.0 * travellers

    hotel_nightly = next((h.price_inr for h in research.hotels if h.price_inr), None) or _STAY_DEFAULT[style]
    rooms = math.ceil(travellers / 2)
    stay_inr = hotel_nightly * nights * rooms

    food_inr = _FOOD_PER_DAY[style] * days * travellers
    activities_inr = 700.0 * days * travellers
    subtotal = transport_inr + stay_inr + food_inr + activities_inr
    misc_inr = round(subtotal * 0.1, 0)
    total = subtotal + misc_inr

    note = "Estimates in INR. Transport uses the cheapest option found."
    if details.budget_inr and details.budget_inr > 0:
        target = float(details.budget_inr)
        transport_inr = round(min(transport_inr, target * 0.30))
        stay_inr = round(target * 0.35)
        food_inr = round(target * 0.22)
        activities_inr = round(target * 0.08)
        misc_inr = round(target - (transport_inr + stay_inr + food_inr + activities_inr))
        total = target
        note = f"Budget customized for ₹{details.budget_inr:,.0f} across {days} days."
    return BudgetBreakdown(
        transport_inr=round(transport_inr), stay_inr=round(stay_inr),
        food_inr=round(food_inr), activities_inr=round(activities_inr),
        misc_inr=round(misc_inr), total_inr=round(total), note=note)


def _dates_for(details: TravelDetails) -> list[str | None]:
    days = details.days or 3
    start: date | None = None
    if details.start_date:
        try:
            start = date.fromisoformat(details.start_date)
        except ValueError:
            start = None
    if start is None:
        start = date.today() + timedelta(days=7)
    return [(start + timedelta(days=i)).isoformat() for i in range(days)]


def assemble_trip_plan(details: TravelDetails, research: Research, plan: PlannerOutput) -> TripPlan:
    days = details.days or max(1, len(plan.days))
    dates = _dates_for(details)
    attractions, restaurants, hotels = research.attractions, research.restaurants, research.hotels
    stay_name = hotels[0].name if hotels else None
    stay_obj = hotels[0] if hotels else None

    transport_choice = None
    if research.transport:
        transport_choice = min(
            [o for o in research.transport if o.price_inr] or research.transport,
            key=lambda o: o.price_inr or 1e12)

    itinerary: list[DayPlan] = []
    pins: list[MapPin] = []
    used: set[str] = set()

    def slot_activity(pick_idx: int | None, slot: str) -> DayActivity | None:
        if pick_idx is None or not (0 <= pick_idx < len(attractions)):
            return None
        p = attractions[pick_idx]
        return DayActivity(
            slot=slot, title=p.name, place=p.name, lat=p.lat, lon=p.lon,
            image_url=p.image_url, description=p.description, duration_hours=2.0)

    by_day = {d.day: d for d in plan.days}
    for i in range(days):
        dnum = i + 1
        pick = by_day.get(dnum) or DayPick(day=dnum, theme=f"Day {dnum}")
        acts = [a for a in (slot_activity(pick.morning, "morning"),
                            slot_activity(pick.afternoon, "afternoon"),
                            slot_activity(pick.evening, "evening")) if a]
        for a in acts:
            if a.title not in used:
                used.add(a.title)
                if a.lat is not None and a.lon is not None:
                    pins.append(MapPin(lat=a.lat, lon=a.lon, label=a.title, kind="activity", day=dnum, image_url=a.image_url))

        def meal(idx: int | None) -> str | None:
            if idx is None or not (0 <= idx < len(restaurants)):
                return None
            r = restaurants[idx]
            if r.lat is not None and r.lon is not None and r.name not in used:
                used.add(r.name)
                pins.append(MapPin(lat=r.lat, lon=r.lon, label=r.name, kind="restaurant", day=dnum, image_url=r.image_url))
            return r.name

        def breakfast(i: int) -> str | None:
            cafes = [r for r in restaurants
                     if any(k in (r.cuisine or "").lower()
                            for k in ("cafe", "bakery", "coffee", "breakfast", "tea"))]
            if cafes:
                return cafes[i % len(cafes)].name
            if stay_name:
                return f"Breakfast at {stay_name}"
            if restaurants:
                return restaurants[i % len(restaurants)].name
            return None

        meals = DayMeals(breakfast=breakfast(i), lunch=meal(pick.lunch), dinner=meal(pick.dinner))
        summary = pick.summary or (f"Cover {', '.join(a.title for a in acts[:2])} at a {details.pace} pace." if acts else f"Explore {details.destination}.")
        itinerary.append(DayPlan(
            day=dnum, date=dates[i] if i < len(dates) else None,
            theme=pick.theme or f"Day {dnum}", activities=acts, meals=meals,
            stay=stay_name, transport=transport_choice.title if transport_choice else None,
            summary=summary))

    if stay_obj and stay_obj.lat is not None:
        pins.append(MapPin(lat=stay_obj.lat, lon=stay_obj.lon, label=stay_obj.name, kind="hotel", image_url=stay_obj.image_url))

    center = research.destination_geo
    if not center and attractions and attractions[0].lat is not None:
        center = GeoPoint(lat=attractions[0].lat, lon=attractions[0].lon, label=details.destination or "")

    highlights = [h for h in plan.highlights if h][:5]
    if not highlights:
        highlights = [p.name for p in attractions[:4]]
    tips = [t for t in plan.tips if t][:5]

    return TripPlan(
        destination=details.destination or "", origin=details.origin,
        days=days, travellers=details.travellers,
        route_summary=(
            f"{details.origin} → {details.destination} · {days} days · {details.travellers} traveller(s)"
            if details.origin else
            f"{details.destination} · {days} days · {details.travellers} traveller(s)"),
        itinerary=itinerary, attractions=attractions, restaurants=restaurants,
        hotels=hotels, transport=research.transport, budget=_build_budget(details, research),
        map_center=center, origin_geo=research.origin_geo, map_pins=pins,
        highlights=highlights, tips=tips)


def plan_itinerary(details: TravelDetails, research: Research, ctx: str) -> PlannerOutput:
    llm = get_llm()
    if llm is None or not research.attractions:
        return _fallback_output(details, research)
    try:
        structured = llm.with_structured_output(PlannerOutput, method="json_schema")
        raw = structured.invoke(build_planner_prompt(details, research, ctx))
        plan = raw if isinstance(raw, PlannerOutput) else PlannerOutput.model_validate(raw)
        if not plan.days:
            return _fallback_output(details, research)
        return plan
    except Exception as exc:  # noqa: BLE001
        logger.warning("Planner LLM unavailable, using fallback: %s", exc)
        return _fallback_output(details, research)


def planner_node(state: TravelPlannerState) -> dict:
    details = state.get("details") or TravelDetails()
    user_message = state.get("user_message", "")
    research = Research(
        origin_geo=state.get("origin_geo"), destination_geo=state.get("destination_geo"),
        attractions=state.get("attractions", []),
        restaurants=state.get("restaurants", []),
        hotels=state.get("hotels", []),
        transport=state.get("transport_options", []),
    )
    from app.agents.state import LongMemory
    from app.agents.memory import MemoryPayload

    long = state.get("long_memory") or LongMemory()
    ctx = memory_context(details, MemoryPayload(short=state.get("short_memory", []), long=long))
    plan = plan_itinerary(details, research, ctx)
    trip = assemble_trip_plan(details, research, plan)

    lead, text = _generate_plan_reply(trip, details, user_message, ctx)
    return {"trip_plan": trip, "research": research, "reply_lead": lead, "reply_text": text,
            "notes": [f"Planned {trip.days} days across {len(trip.attractions)} attractions."],
            "errors": []}


def _generate_plan_reply(trip: TripPlan, details: TravelDetails, user_message: str, ctx: str) -> tuple[str, str]:
    llm = get_llm()
    if llm is not None and user_message:
        try:
            budget_str = f"₹{details.budget_inr:,.0f}" if details.budget_inr else "Standard budget"
            prompt = [
                {
                    "role": "system",
                    "content": (
                        "You are Destinify, a warm, intelligent travel planning agent.\n"
                        "An updated day-by-day trip plan and map have just been created for the traveller.\n"
                        "Write a 2-4 sentence conversational reply that directly addresses the user's latest prompt.\n"
                        "If the user mentioned a budget, pace, specific destination, or modifications, acknowledge it explicitly and explain how this plan caters to it.\n"
                        "Rules:\n"
                        "- No markdown headings, bullet points, or robotic templates.\n"
                        "- Keep it natural, friendly, and practical.\n"
                        "- End with one helpful suggestion or follow-up question."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Traveller context:\n{ctx}\n\n"
                        f"User's latest message: {user_message}\n\n"
                        f"Trip plan details:\n"
                        f"- Destination: {trip.destination}\n"
                        f"- Days: {trip.days}\n"
                        f"- User Budget: {budget_str}\n"
                        f"- Estimated Total Cost: ₹{trip.budget.total_inr:,.0f} (Stay: ₹{trip.budget.stay_inr:,.0f}, Food: ₹{trip.budget.food_inr:,.0f}, Transport: ₹{trip.budget.transport_inr:,.0f})\n"
                        f"- Highlights: {', '.join(trip.highlights[:3])}\n"
                        f"- Stays found: {len(trip.hotels)}, Restaurants found: {len(trip.restaurants)}"
                    ),
                },
            ]
            resp = llm.invoke(prompt)
            reply = (resp.content if hasattr(resp, "content") else str(resp)).strip()
            if reply:
                lead = f"Here's your {trip.days}-day {trip.destination} plan"
                if details.budget_inr:
                    lead += f" for ₹{details.budget_inr:,.0f}"
                lead += "."
                return lead, reply
        except Exception as exc:
            logger.warning("LLM reply generation failed: %s", exc)

    return _fallback_reply_text(trip, details)


def _fallback_reply_text(trip: TripPlan, details: TravelDetails) -> tuple[str, str]:
    lead = f"Here's your {trip.days}-day {trip.destination} plan"
    if details.budget_inr:
        lead += f" for ₹{details.budget_inr:,.0f}"
    lead += "."
    parts = [f"I built a {trip.days}-day plan for {trip.destination} with real places, food, stays, transport and a map."]
    if details.budget_inr:
        parts.append(f"It is tailored for your ₹{details.budget_inr:,.0f} budget with estimated total expenses of ₹{trip.budget.total_inr:,.0f}.")
    if trip.itinerary and trip.itinerary[0].activities:
        parts.append(f"Day 1 starts at {trip.itinerary[0].activities[0].title}.")
    if trip.highlights:
        parts.append("Highlights: " + ", ".join(trip.highlights[:3]) + ".")
    return lead, " ".join(parts)
