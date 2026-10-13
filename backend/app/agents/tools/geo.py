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
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
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

# Image lookups are 1-3 HTTP calls *per place*; doing them serially made a
# single city cost 100s+. Resolve them concurrently instead.
_IMG_POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix="geo-img")


def parallel(fn, items: list) -> list:
    """Map `fn` over `items` concurrently (empty input -> empty output)."""
    if not items:
        return []
    return list(_IMG_POOL.map(fn, items))


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
        if resp.status_code == 404:
            return None  # no such article/image — expected, not worth a warning
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

def _overpass_fetch(url: str, query: str) -> list[dict]:
    """One Overpass request. Returns [] on any failure (status, timeout, parse)."""
    try:
        resp = httpx.post(url, data={"data": query}, headers=_headers(), timeout=18.0)
        if resp.status_code != 200:
            logger.debug("overpass %s -> HTTP %s", url, resp.status_code)
            return []
        data = resp.json()
        if isinstance(data, dict) and "elements" in data:
            return data["elements"]
    except Exception as exc:  # noqa: BLE001 - try the next mirror
        logger.warning("overpass mirror failed (%s): %s", url, exc)
    return []


def _overpass(query: str) -> list[dict]:
    """POST an Overpass QL query with mirror failover. Returns elements (or []).

    The first two mirrors are raced concurrently and the first good answer wins
    — the public instances are individually flaky, and waiting for one timeout
    after another made a single city query take a minute.
    """
    mirrors = list(settings.OVERPASS_MIRRORS or [settings.OVERPASS_URL])
    head, tail = mirrors[:2], mirrors[2:]
    if len(head) > 1:
        with ThreadPoolExecutor(max_workers=len(head), thread_name_prefix="overpass") as pool:
            futures = [pool.submit(_overpass_fetch, url, query) for url in head]
            for fut in as_completed(futures):
                elements = fut.result()
                if elements:
                    for pending in futures:
                        pending.cancel()
                    return elements
    else:
        for url in head:
            if elements := _overpass_fetch(url, query):
                return elements
    for url in tail:  # fall back to the remaining mirrors one at a time
        if elements := _overpass_fetch(url, query):
            return elements
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


def clean_name(raw: Any) -> str | None:
    """Normalise an OSM name and reject unreadable/mojibake entries.

    OSM carries control characters and broken encodings now and then; without
    this a garbage name ends up as a day title, a map pin and an image query.
    """
    if not raw:
        return None
    text = unicodedata.normalize("NFKC", str(raw))
    text = "".join(ch for ch in text if ch.isprintable())
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:!?)])", r"\1", text).strip(" ,.;:-|")
    if not text or len(text) > 120:
        return None
    if text.count("?") > 1 or "\ufffd" in text:
        return None  # broken encoding
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 2:
        return None
    if sum(c.isalnum() for c in text) / len(text) < 0.55:
        return None  # mostly symbols -> unreadable
    return text


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
        name = clean_name(tags.get("name:en")) or clean_name(tags.get("name"))
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

def wikipedia_article(title: str) -> dict | None:
    """Wikipedia REST summary: lead image + short extract + page URL (one call)."""
    key = f"wiki:{title.lower().strip()}"
    if (hit := _cached(key)) is not None:
        return hit
    data = _get_json(settings.WIKIPEDIA_SUMMARY_URL.format(title=title.replace(" ", "_")))
    if not data:
        return None
    thumb = (data.get("thumbnail") or {}).get("source")
    orig = (data.get("originalimage") or {}).get("source")
    return _store(key, {
        "image": thumb or orig,
        "extract": (data.get("extract") or "").strip(),
        "url": ((data.get("content_urls") or {}).get("desktop") or {}).get("page"),
    })


def wikipedia_image(title: str) -> str | None:
    """Thumbnail from a Wikipedia summary by article title. Accurate + real."""
    art = wikipedia_article(title)
    return (art or {}).get("image")


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


def distinct_image(img: str | None, used: set[str]) -> str | None:
    """Never show the same photo twice within one list (better a placeholder)."""
    if not img or img in used:
        return None
    used.add(img)
    return img


def hotel_image(name: str, city: str = "") -> str | None:
    """Prefer a real photo of the property (Openverse) over a chain logo."""
    return (openverse_image(f"{name} hotel {city}".strip())
            or openverse_image(f"{name} {city}".strip())
            or wikipedia_image(name))


def place_media(name: str, city: str) -> dict:
    """Lead image + short extract for a sight (Wikipedia first, then CC search)."""
    article = wikipedia_article(name) or {}
    img = article.get("image")
    if not img:
        img = ((openverse_image(f"{name} {city}") or "").strip()
               or commons_image(f"{name} {city}"))
    return {"image": img or None, "extract": article.get("extract", ""), "url": article.get("url")}


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


def clean_description(raw: Any) -> str:
    """A short human description from OSM tags (falls back to '')."""
    text = clean_name(raw)
    if not text or len(text) > 400:
        return ""
    return text


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

    def rank(p: dict) -> tuple[int, int]:
        # (notability, category) — a Wikidata/Wikipedia-linked POI is almost
        # always the "famous" version of a sight, not a minor local gate.
        notable = 0 if (p["tags"].get("wikidata") or p["tags"].get("wikipedia")) else 1
        return notable, _ATTRACTION_RANK.get(_attraction_category(p["tags"]), 20)

    pois.sort(key=rank)
    pois = pois[:limit]
    city_name = geo.get("city", city)
    # Lead images + Wikipedia extracts resolve concurrently (they used to be
    # the single slowest step in the whole graph).
    media = parallel(lambda p: place_media(p["name"], city_name), pois)
    places: list[Place] = []
    used_images: set[str] = set()
    for p, m in zip(pois, media):
        tags = p["tags"]
        places.append(Place(
            name=p["name"], category=_attraction_category(tags), lat=p["lat"], lon=p["lon"],
            image_url=distinct_image(m.get("image"), used_images),
            description=clean_description(tags.get("description")) or m.get("extract", ""),
            price_level=_price_level(tags),
            opening_hours=tags.get("opening_hours"),
            wiki_url=m.get("url") or (
                f"https://www.wikidata.org/wiki/{tags['wikidata']}" if tags.get("wikidata") else None),
            source="wikipedia" if m.get("extract") else "osm",
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
    images = parallel(lambda p: hotel_image(p["name"], city_name), pois)
    hotels: list[Hotel] = []
    used_images: set[str] = set()
    for p, img in zip(pois, images):
        tags = p["tags"]
        stars = tags.get("stars")
        desc_bits = [clean_description(tags.get("description") or "")]
        if stars:
            desc_bits.append(f"{stars}★")
        wifi = tags.get("internet_access") in ("yes", "wlan")
        hotels.append(Hotel(
            name=p["name"], lat=p["lat"], lon=p["lon"],
            image_url=distinct_image(img, used_images),
            rating=float(stars) if stars and str(stars).replace(".", "").isdigit() else None,
            description=" · ".join(b for b in desc_bits if b),
            amenities=(["Wi-Fi"] if wifi else []) + ([tags["stars"] + "★"] if stars else []),
            source="osm",
        ))
    return hotels, notes
