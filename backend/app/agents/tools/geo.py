"""Free, no-key geodata tools: OpenStreetMap (Overpass + Nominatim) + Wikimedia.

These give the agent REAL, per-city data (attractions, restaurants, hotels) with
REAL images without requiring any API key — so the product works on day one.
Optional paid providers (Yelp/Amadeus) live in `providers.py` and are used only
when a key is configured (auto-upgrade).

Every network call is wrapped so a failure degrades to an empty result + a note
instead of raising — the graph must never hard-depend on the internet.
"""

from __future__ import annotations

import logging
import time
from math import cos, radians
from typing import Any

import httpx

from app.agents.state import Hotel, Place, Restaurant
from app.core.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = 25.0
# Simple in-process TTL cache so repeated asks for the same city don't hammer
# the free endpoints (they rate-limit aggressively).
_CACHE: dict[str, tuple[float, Any]] = {}


def _cached(key: str):
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < settings.GEO_CACHE_TTL_SECONDS:
        return hit[1]
    return None


def _store(key: str, value: Any) -> Any:
    _CACHE[key] = (time.time(), value)
    return value


def _headers() -> dict[str, str]:
    return {"User-Agent": settings.GEO_USER_AGENT, "Accept": "application/json"}


def _get_json(url: str, *, params: dict | None = None, data: dict | None = None,
              timeout: float = _TIMEOUT) -> Any:
    """GET/POST JSON with graceful degradation. Returns None on any failure."""
    try:
        if data is not None:
            resp = httpx.post(url, data=data, headers=_headers(), timeout=timeout)
        else:
            resp = httpx.get(url, params=params, headers=_headers(), timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:  # noqa: BLE001 - free endpoints flaking must not crash the agent
        logger.warning("geodata request failed (%s): %s", url, exc)
        return None


# --------------------------------------------------------------------------- #
# Nominatim — geocoding                                                       #
# --------------------------------------------------------------------------- #

def geocode(query: str) -> dict | None:
    """Resolve a place name to lat/lon via Nominatim. Returns None when unknown."""
    key = f"geo:{query.lower().strip()}"
    if (hit := _cached(key)) is not None:
        return hit
    data = _get_json(settings.NOMINATIM_URL,
                     params={"q": query, "format": "json", "limit": 1, "addressdetails": 1})
    if not data or not isinstance(data, list):
        return None
    top = data[0]
    result = {
        "lat": float(top["lat"]),
        "lon": float(top["lon"]),
        "display_name": top.get("display_name", query),
        "city": _extract_city(top.get("address", {})) or query,
        "country": (top.get("address", {}) or {}).get("country", ""),
    }
    return _store(key, result)


def _extract_city(address: dict) -> str | None:
    for key in ("city", "town", "village", "municipality", "county", "state"):
        if address.get(key):
            return address[key]
    return None


# --------------------------------------------------------------------------- #
# Overpass — real POIs from OpenStreetMap                                     #
# --------------------------------------------------------------------------- #

def _overpass(query: str) -> list[dict]:
    """POST an Overpass QL query with mirror failover. Returns elements (or [])."""
    for url in settings.OVERPASS_MIRRORS or [settings.OVERPASS_URL]:
        try:
            resp = httpx.post(url, data={"data": query}, headers=_headers(), timeout=30.0)
            if resp.status_code != 200:
                continue
            data = resp.json()
            if isinstance(data, dict) and "elements" in data:
                return data["elements"]
        except Exception as exc:  # noqa: BLE001 - try the next mirror
            logger.warning("overpass mirror failed (%s): %s", url, exc)
    return []


def _element_point(el: dict) -> tuple[float, float] | None:
    if "lat" in el and "lon" in el:
        return float(el["lat"]), float(el["lon"])
    center = el.get("center")
    if center and "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None


def _bbox(lat: float, lon: float, radius_m: int) -> str:
    dlat = radius_m / 111000.0
    dlon = radius_m / (111000.0 * max(0.2, cos(radians(lat))))
    return f"{lat - dlat:.5f},{lon - dlon:.5f},{lat + dlat:.5f},{lon + dlon:.5f}"


def _pois(geo: dict, kind: str, radius: int, limit: int) -> list[dict]:
    """Query Overpass for named POIs of a kind in a bbox, deduped by name.

    Uses node/way + a bounding box (spatial-index friendly) rather than the far
    more expensive `nwr` + `around`, which the public instances often 504 on.
    """
    lat, lon = geo["lat"], geo["lon"]
    cache_key = f"pois:{kind}:{round(lat,3)},{round(lon,3)}:{radius}:{limit}"
    if (hit := _cached(cache_key)) is not None:
        return hit

    bbox = _bbox(lat, lon, radius)
    clauses: list[str] = []
    for tag_k, tag_v in _OVERPASS_FILTERS[kind]:
        value = f'~"{tag_v}"' if tag_v else ""
        clauses.append(f'  node["{tag_k}"{value}]({bbox});')
        clauses.append(f'  way["{tag_k}"{value}]({bbox});')
    ql = "[out:json][timeout:25];\n(\n" + "\n".join(clauses) + "\n);\nout center tags;"
    raw = _overpass(ql)

    seen: set[str] = set()
    out: list[dict] = []
    for el in raw:
        tags = el.get("tags", {}) or {}
        name = tags.get("name") or tags.get("name:en")
        if not name or name.lower() in seen:
            continue
        pt = _element_point(el)
        if not pt:
            continue
        seen.add(name.lower())
        out.append({"name": name, "tags": tags, "lat": pt[0], "lon": pt[1]})
        if len(out) >= limit * 2:  # fetch extra, ranking happens after images
            break
    return _store(cache_key, out)


_OVERPASS_FILTERS: dict[str, list[tuple[str, str]]] = {
    "attractions": [
        ("tourism", "attraction|artwork|museum|viewpoint|gallery|zoo|theme_park|castle|aquarium"),
        ("historic", "castle|monument|memorial|ruins|archaeological_site"),
        ("natural", "peak|waterfall|bay|beach|cliff"),
        ("leisure", "park|garden"),
    ],
    "restaurants": [
        ("amenity", "restaurant|cafe|fast_food|bar|pub|food_court"),
    ],
    "stay": [
        ("tourism", "hotel|hostel|guest_house|apartment|motel|resort|camp_site"),
    ],
}


# --------------------------------------------------------------------------- #
# Wikimedia — real images                                                     #
# --------------------------------------------------------------------------- #

def wikipedia_image(title: str) -> str | None:
    """Thumbnail from a Wikipedia summary by article title. Accurate + real."""
    url = settings.WIKIPEDIA_SUMMARY_URL.format(title=title.replace(" ", "_"))
    data = _get_json(url)
    if not data:
        return None
    thumb = (data.get("thumbnail") or {}).get("source")
    orig = (data.get("originalimage") or {}).get("source")
    return thumb or orig


def commons_image(query: str) -> str | None:
    """Topical image from Wikimedia Commons search (best-effort fallback)."""
    data = _get_json(settings.WIKIMEDIA_COMMONS_SEARCH_URL, params={
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": f"filetype:bitmap {query}", "gsrlimit": 1,
        "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 800,
    })
    if not data:
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        return info.get("thumburl") or info.get("url")
    return None


def openverse_image(query: str) -> str | None:
    """Topical CC image from Openverse — works for restaurants/hotels too."""
    data = _get_json(settings.OPENVERSE_IMAGES_URL,
                     params={"q": query, "page_size": 1, "license_type": "all"})
    if not data:
        return None
    results = data.get("results") or []
    if results:
        return results[0].get("url") or results[0].get("thumbnail")
    return None


def image_for(name: str, *, city: str = "", kind: str = "place") -> str | None:
    """Resolve a real image: Wikipedia (accurate) -> Openverse -> Commons."""
    key = f"img:{kind}:{name.lower().strip()}|{city.lower().strip()}"
    if (hit := _cached(key)) is not None:
        return hit
    img = wikipedia_image(name)
    if not img:
        img = openverse_image(f"{name} {city}".strip())
    if not img:
        img = commons_image(f"{name} {city}".strip())
    return _store(key, img)


def food_image(name: str, cuisine: str = "", city: str = "") -> str | None:
    """Real food/venue image for a restaurant (Openverse first — no wiki article)."""
    key = f"img:food:{name.lower().strip()}|{city.lower().strip()}"
    if (hit := _cached(key)) is not None:
        return hit
    img = openverse_image(f"{name} {cuisine} {city}".strip()) or openverse_image(
        f"{cuisine} restaurant {city}".strip())
    return _store(key, img)


# --------------------------------------------------------------------------- #
# Ranked search entry points used by the research subagents                   #
# --------------------------------------------------------------------------- #

_ATTRACTION_RANK = {
    "attraction": 0, "viewpoint": 1, "castle": 2, "museum": 3, "monument": 4,
    "historic": 5, "artwork": 6, "gallery": 7, "park": 8, "garden": 9,
    "peak": 10, "waterfall": 11, "beach": 12, "zoo": 13, "theme_park": 14,
}


def _attraction_category(tags: dict) -> str:
    for key in ("tourism", "historic", "natural", "leisure"):
        if tags.get(key):
            return tags[key]
    return "attraction"


def _attraction_description(tags: dict) -> str:
    desc = tags.get("description") or tags.get("name:en") or ""
    wiki = tags.get("wikidata")
    bits = [b for b in [desc, ("Wikidata " + wiki) if wiki else ""] if b]
    return " · ".join(bits)


def _price_level(tags: dict) -> str | None:
    cost = tags.get("charge") or tags.get("cost")
    if cost:
        return str(cost)
    lvl = tags.get("price_level")
    return {"0": "$", "1": "$$", "2": "$$$", "3": "$$$$"}.get(str(lvl)) if lvl else None


def search_attractions(city: str, limit: int = 18) -> tuple[list[Place], list[str]]:
    """Ranked attractions for a city, each with a real image when one exists."""
    notes: list[str] = []
    geo = geocode(city)
    if not geo:
        return [], [f"Could not geocode '{city}'."]
    pois = _pois(geo, "attractions", radius=9000, limit=limit)
    if not pois:
        notes.append(f"No OpenStreetMap attractions found near {geo.get('city', city)}.")
        return [], notes

    def rank(p: dict) -> int:
        return _ATTRACTION_RANK.get(_attraction_category(p["tags"]), 20)

    pois.sort(key=rank)
    pois = pois[:limit]
    city_name = geo.get("city", city)
    places: list[Place] = []
    for p in pois:
        tags = p["tags"]
        category = _attraction_category(tags)
        places.append(Place(
            name=p["name"], category=category, lat=p["lat"], lon=p["lon"],
            image_url=image_for(p["name"], city=city_name, kind="attraction"),
            description=_attraction_description(tags),
            price_level=_price_level(tags),
            opening_hours=tags.get("opening_hours"),
            wiki_url=tags.get("wikidata") and f"https://www.wikidata.org/wiki/{tags['wikidata']}",
            source="osm",
        ))
    return places, notes


def _cuisine(tags: dict) -> str:
    c = tags.get("cuisine")
    if not c:
        return tags.get("amenity", "").replace("_", " ").title() or "Local"
    return ", ".join(part.strip().title() for part in c.split(";"))


def search_restaurants(city: str, limit: int = 22) -> tuple[list[Restaurant], list[str]]:
    """Real restaurants/cafes from OSM; images via Yelp (if keyed) or Commons."""
    notes: list[str] = []
    geo = geocode(city)
    if not geo:
        return [], [f"Could not geocode '{city}'."]
    pois = _pois(geo, "restaurants", radius=4000, limit=limit)
    if not pois:
        notes.append(f"No OpenStreetMap restaurants found near {geo.get('city', city)}.")
        return [], notes

    # Prefer ones that look like sit-down restaurants, then cafes/bars.
    def rank(p: dict) -> int:
        amenity = p["tags"].get("amenity", "")
        return {"restaurant": 0, "cafe": 1, "bar": 2, "pub": 3,
                "fast_food": 4, "food_court": 5}.get(amenity, 9)

    pois.sort(key=rank)
    pois = pois[:limit]
    city_name = geo.get("city", city)
    restaurants: list[Restaurant] = []
    for p in pois:
        tags = p["tags"]
        restaurants.append(Restaurant(
            name=p["name"], cuisine=_cuisine(tags), lat=p["lat"], lon=p["lon"],
            price_level=_price_level(tags),
            source="osm",
        ))
    return restaurants, notes


def search_hotels(city: str, limit: int = 16) -> tuple[list[Hotel], list[str]]:
    """Real hotels/hostels from OSM with images and any listed price/star info."""
    notes: list[str] = []
    geo = geocode(city)
    if not geo:
        return [], [f"Could not geocode '{city}'."]
    pois = _pois(geo, "stay", radius=6000, limit=limit)
    if not pois:
        notes.append(f"No OpenStreetMap stays found near {geo.get('city', city)}.")
        return [], notes

    def rank(p: dict) -> int:
        t = p["tags"].get("tourism", "")
        return {"hotel": 0, "resort": 1, "guest_house": 2, "apartment": 3,
                "motel": 4, "hostel": 5, "camp_site": 6}.get(t, 9)

    pois.sort(key=rank)
    pois = pois[:limit]
    city_name = geo.get("city", city)
    hotels: list[Hotel] = []
    for p in pois:
        tags = p["tags"]
        stars = tags.get("stars")
        desc_bits = [tags.get("description") or ""]
        if stars:
            desc_bits.append(f"{stars}★")
        wifi = tags.get("internet_access") in ("yes", "wlan")
        hotels.append(Hotel(
            name=p["name"], lat=p["lat"], lon=p["lon"],
            image_url=image_for(p["name"], city=city_name, kind="hotel"),
            rating=float(stars) if stars and str(stars).replace(".", "").isdigit() else None,
            description=" · ".join(b for b in desc_bits if b),
            amenities=(["Wi-Fi"] if wifi else []) + ([tags["stars"] + "★"] if stars else []),
            source="osm",
        ))
    return hotels, notes
