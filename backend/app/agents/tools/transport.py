"""Transport tools: fix live RapidAPI flight parsing + distance-based estimates.

The original flight tool passed `str(json)[:64]` as the skyId (a bug that made
flights impossible). Here we parse the airport response properly, and when live
data is unavailable we produce DETERMINISTIC, distance-based estimates so every
route yields distinct, plausible fares instead of identical placeholders.
"""

from __future__ import annotations

import json
import logging
import re
from math import asin, cos, radians, sin, sqrt

import httpx

from app.agents.state import TransportOption
from app.agents.tools.geo import geocode
from app.core.config import settings

logger = logging.getLogger(__name__)
TIMEOUT = 20.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


def route_distance_km(origin: str, destination: str) -> float | None:
    """Geocode both ends and return great-circle distance (or None)."""
    o, d = geocode(origin), geocode(destination)
    if not o or not d:
        return None
    return round(haversine_km(o["lat"], o["lon"], d["lat"], d["lon"]), 1)


def _duration_label(mins: int | None) -> str | None:
    if not mins or mins <= 0:
        return None
    h, m = divmod(int(mins), 60)
    return f"{h}h {m:02d}m" if h else f"{m}m"


# --------------------------------------------------------------------------- #
# Live RapidAPI (auto-upgrade when a working subscription is active)          #
# --------------------------------------------------------------------------- #

def _rapid(host: str, path: str, params: dict) -> dict | None:
    if not settings.RAPID_API_KEY:
        return None
    try:
        resp = httpx.get(
            f"https://{host}{path}",
            headers={"x-rapidapi-key": settings.RAPID_API_KEY, "x-rapidapi-host": host},
            params=params, timeout=TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, dict) else {"data": data}
    except Exception as exc:  # noqa: BLE001
        logger.warning("rapidapi call failed (%s%s): %s", host, path, exc)
        return None


def _resolve_airport(query: str) -> dict | None:
    """Parse skyId/entityId out of a sky-scrapper searchAirport response."""
    data = _rapid(settings.RAPID_FLIGHT_HOST, "/api/v1/flights/searchAirport", {"query": query})
    if not data:
        return None
    entries = data.get("data") if isinstance(data.get("data"), list) else data.get("data", [])
    if isinstance(entries, dict):
        entries = [entries]
    if not entries:
        return None
    first = entries[0]
    sky = first.get("skyId") or first.get("sky_id")
    entity = first.get("entityId") or first.get("entity_id") or first.get("id")
    if not sky or not entity:
        return None
    return {"skyId": sky, "entityId": entity, "label": first.get("presentation", {}).get("title") or query}


def live_flight_options(origin: str, destination: str, date: str, image_url: str | None) -> list[TransportOption]:
    """Attempt a live flight search; return [] when unavailable/failed."""
    if not settings.RAPID_API_KEY:
        return []
    o, d = _resolve_airport(origin), _resolve_airport(destination)
    if not o or not d:
        return []
    params = {"originSkyId": o["skyId"], "originEntityId": o["entityId"],
              "destinationSkyId": d["skyId"], "destinationEntityId": d["entityId"]}
    if date:
        params["date"] = date
    data = _rapid(settings.RAPID_FLIGHT_HOST, "/api/v1/flights/searchFlights", params)
    if not data:
        return []
    raw = data.get("data") if isinstance(data.get("data"), list) else []
    options: list[TransportOption] = []
    for item in raw[:6]:
        try:
            price = float(item.get("price", {}).get("raw")) if isinstance(item.get("price"), dict) else None
        except (TypeError, ValueError):
            price = None
        legs = item.get("legs", []) or []
        dur = None
        if legs and legs[0].get("durationInMinutes"):
            dur = int(legs[0]["durationInMinutes"])
        carrier = ""
        if legs and legs[0].get("carriers", {}).get("marketing"):
            carrier = ", ".join(c.get("name", "") for c in legs[0]["carriers"]["marketing"][:2])
        options.append(TransportOption(
            mode="flight",
            title=f"{o.get('label') or origin} → {d.get('label') or destination}"
                  + (f" · {carrier}" if carrier else ""),
            price_inr=price, duration_min=dur, provider=carrier or "Airline",
            departure=legs[0].get("departure") if legs else None,
            arrival=legs[0].get("arrival") if legs else None,
            image_url=image_url, source="rapidapi",
        ))
    return options


# --------------------------------------------------------------------------- #
# Deterministic distance-based estimates (always available, distinct per route) #
# --------------------------------------------------------------------------- #

# per-km-ish rates (INR) and avg speed (km/h) tuned for India intercity travel.
_MODE_RATES = {
    "flight": {"base": 2600.0, "per_km": 4.2, "speed": 700.0, "label": "Airline (est.)"},
    "train": {"base": 300.0, "per_km": 1.15, "speed": 55.0, "label": "Rail (est.)"},
    "bus": {"base": 250.0, "per_km": 0.95, "speed": 45.0, "label": "Coach (est.)"},
    "cab": {"base": 300.0, "per_km": 13.0, "speed": 40.0, "label": "Cab (est.)"},
}


def estimate_transport(origin: str, destination: str, distance_km: float | None,
                       image_url: str | None, modes: list[str] | None = None) -> list[TransportOption]:
    """Produce distance-based fare estimates for plausible intercity modes."""
    if distance_km is None or distance_km <= 0:
        distance_km = 250.0
    wanted = [m for m in (modes or ["flight", "train", "bus", "cab"]) if m in _MODE_RATES]
    options: list[TransportOption] = []
    for mode in wanted:
        rate = _MODE_RATES[mode]
        price = round(rate["base"] + distance_km * rate["per_km"], 0)
        # Cab only makes sense for shorter hops.
        if mode == "cab" and distance_km > 600:
            continue
        duration = int((distance_km / rate["speed"]) * 60) + 15
        note = "Estimate (add/activate a live fare source for exact pricing)."
        if mode == "flight" and distance_km < 250:
            continue  # no point flying a very short hop
        options.append(TransportOption(
            mode=mode,  # type: ignore[arg-type]
            title=f"{mode.title()} {origin} → {destination}",
            price_inr=price, duration_min=duration, provider=rate["label"],
            image_url=image_url, source="estimate", note=note,
            details={"scope": "intercity", "distance_km": distance_km,
                     "duration_label": _duration_label(duration)},
        ))
    return options


def local_transport_options(city: str, image_url: str | None) -> list[TransportOption]:
    """Getting-around options for the destination itself.

    Used when no departure city is known yet — real, distinct, city-scope prices
    instead of invented intercity fares for an unknown route.
    """
    specs = [
        ("cab", f"Auto-rickshaw & taxi (full day)", 1800.0, "Local hire (est.)",
         "Hops between sights; agree the fare or use a meter."),
        ("cab", f"Full-day cab with driver", 2600.0, "Local hire (est.)",
         "Comfortable for 2-4 people covering the whole day."),
        ("bus", "City buses & day passes", 120.0, "Public transport (est.)",
         "Cheapest option on the main routes."),
        ("metro", "Metro / local rail day pass", 150.0, "Local rail (est.)",
         "Where the city has a metro or suburban rail."),
    ]
    note = "Local estimates. Add your departure city (e.g. 'from Delhi') to compare flights and trains."
    return [
        TransportOption(
            mode=mode,  # type: ignore[arg-type]
            title=f"{title} · {city}",
            price_inr=price, provider=provider, image_url=image_url,
            source="estimate", note=note,
            details={"scope": "local", "duration_label": "per day"},
        )
        for mode, title, price, provider, _hint in specs
    ]


def transport_options(origin: str, destination: str, start_date: str | None,
                      image_url: str | None, prefer: list[str] | None = None) -> list[TransportOption]:
    """Live flight search when possible, else estimates. Always returns options."""
    out: list[TransportOption] = []
    live = live_flight_options(origin, destination, start_date or "", image_url)
    out.extend(live)
    modes = ["train", "bus", "cab"] + (["flight"] if not live else [])
    out.extend(estimate_transport(origin, destination, route_distance_km(origin, destination),
                                  image_url, modes=modes))
    return out
