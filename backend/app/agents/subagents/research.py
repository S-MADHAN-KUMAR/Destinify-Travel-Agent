"""Research subagents: real per-city attractions, restaurants, stays + transport.

Each node is a pure `(state) -> dict` LangGraph node that appends its findings
to a reducer field. They degrade gracefully (empty + a note) when a source is
unreachable, so the planner always has something to work with.
"""

from __future__ import annotations

import logging

from app.agents.state import GeoPoint, Restaurant, TravelPlannerState
from app.agents.tools import geo, providers
from app.agents.tools.transport import local_transport_options, transport_options
from app.core.config import settings

logger = logging.getLogger(__name__)


def _destination(state: TravelPlannerState) -> str | None:
    d = state.get("details")
    return d.destination if d else None


def _origin(state: TravelPlannerState) -> str | None:
    """Departure city: message first, then the durable home-city memory."""
    d = state.get("details")
    if d and d.origin:
        return d.origin
    long = state.get("long_memory")
    if long and long.home_city:
        return long.home_city
    return None


def _to_geopoint(g: dict | None, label: str) -> GeoPoint | None:
    if not g:
        return None
    return GeoPoint(lat=g["lat"], lon=g["lon"], label=g.get("city") or label)


def attractions_node(state: TravelPlannerState) -> dict:
    destination = _destination(state)
    if not destination:
        return {"attractions": [], "notes": ["No destination to research."], "errors": []}
    notes: list[str] = []
    try:
        g = geo.geocode(destination)
        destination_geo = _to_geopoint(g, destination)
        places, geo_notes = geo.search_attractions(destination, limit=16)
        notes.extend(geo_notes)
        # Attach images for the top attractions lazily (already done in search).
        update: dict = {"attractions": places, "notes": notes, "errors": []}
        if destination_geo:
            update["destination_geo"] = destination_geo
        o = _origin(state)
        if o:
            og = geo.geocode(o)
            if og:
                update["origin_geo"] = GeoPoint(lat=og["lat"], lon=og["lon"], label=og.get("city") or o)
        return update
    except Exception as exc:  # noqa: BLE001
        logger.warning("attractions research failed: %s", exc)
        return {"attractions": [], "notes": [], "errors": [f"attractions: {exc}"]}


def food_node(state: TravelPlannerState) -> dict:
    destination = _destination(state)
    if not destination:
        return {"restaurants": [], "notes": ["No destination for food research."], "errors": []}
    try:
        g = geo.geocode(destination)
        city_name = (g or {}).get("city", destination)
        notes: list[str] = []
        restaurants: list[Restaurant] = []
        # Auto-upgrade: Yelp photos when keyed, else free OSM + Openverse images.
        if settings.YELP_API_KEY:
            restaurants = providers.yelp_restaurants(destination, limit=14)
            if restaurants:
                notes.append("Restaurant photos & ratings via Yelp.")
        if not restaurants:
            restaurants, notes = geo.search_restaurants(destination, limit=14)
            used: set[str] = set()
            for r in restaurants[:10]:  # photo lookups are rate-limited; cap them
                img = geo.food_image(r.name, r.cuisine, city_name)
                if not img or img in used:
                    # Retry with a venue-flavoured query before falling back.
                    img = geo.openverse_image(f"{r.name} {city_name} interior")
                r.image_url = geo.distinct_image(img, used)
        return {"restaurants": restaurants, "notes": notes, "errors": []}
    except Exception as exc:  # noqa: BLE001
        logger.warning("food research failed: %s", exc)
        return {"restaurants": [], "notes": [], "errors": [f"food: {exc}"]}


def stay_node(state: TravelPlannerState) -> dict:
    destination = _destination(state)
    if not destination:
        return {"hotels": [], "notes": ["No destination for stay research."], "errors": []}
    try:
        hotels, notes = geo.search_hotels(destination, limit=12)
        return {"hotels": hotels, "notes": notes, "errors": []}
    except Exception as exc:  # noqa: BLE001
        logger.warning("stay research failed: %s", exc)
        return {"hotels": [], "notes": [], "errors": [f"stay: {exc}"]}


def transport_node(state: TravelPlannerState) -> dict:
    origin, destination = _origin(state), _destination(state)
    if not destination:
        return {"transport_options": [], "notes": ["No destination for transport."], "errors": []}
    d = state.get("details")
    start_date = d.start_date if d else None
    # Use the destination's landmark image on transport cards when we have one.
    image_url = None
    attractions = state.get("attractions") or []
    for p in attractions:
        if p.image_url:
            image_url = p.image_url
            break
    try:
        notes: list[str] = []
        if not origin:
            # No departure city yet -> getting-around options for the destination,
            # never a fabricated fare for an unknown route.
            return {
                "transport_options": local_transport_options(destination, image_url),
                "notes": ["No departure city yet — showing local transport. "
                          "Add one (e.g. 'from Delhi') for flights and trains."],
                "errors": [],
            }
        opts = transport_options(origin, destination, start_date, image_url)
        # Auto-upgrade: prepend real Amadeus offers when keyed.
        if settings.AMADEUS_KEY and settings.AMADEUS_SECRET:
            live = providers.amadeus_flights(origin, destination, start_date or "", image_url)
            if live:
                opts = live + [o for o in opts if o.mode != "flight"]
                notes.append("Live flight fares via Amadeus.")
        if not any(o.source in ("rapidapi", "amadeus") for o in opts):
            notes.append("Live flight fares unavailable; showing distance-based estimates.")
        return {"transport_options": opts, "notes": notes, "errors": []}
    except Exception as exc:  # noqa: BLE001
        logger.warning("transport research failed: %s", exc)
        return {"transport_options": [], "notes": [], "errors": [f"transport: {exc}"]}


RESEARCH_NODES = {
    "attractions": attractions_node,
    "food": food_node,
    "stay": stay_node,
    "transport": transport_node,
}
