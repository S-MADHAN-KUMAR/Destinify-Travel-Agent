"""RapidAPI tool wrappers used by the travel subagents.

One RAPID_API_KEY unlocks many provider APIs. Hosts are configurable in settings
because they depend on which RapidAPI plans are subscribed:
- flights default: sky-scrapper (Skyscanner mirror): searchAirport + searchFlights
- trains/buses: provider-specific hosts, override via RAPID_TRAIN_HOST / RAPID_BUS_HOST
- generic rapidapi_proxy tool works with ANY RapidAPI host/endpoint.

All tools degrade gracefully when the key is missing (network never required for tests).
"""

from __future__ import annotations

import json

import httpx
from langchain_core.tools import tool

from app.core.config import settings

TIMEOUT = 20.0


def _headers(host: str) -> dict[str, str]:
    return {"x-rapidapi-key": settings.RAPID_API_KEY, "x-rapidapi-host": host}


def rapidapi_get(host: str, path: str, params: dict) -> dict:
    """Low-level GET against a RapidAPI host. Raises RuntimeError when key is missing."""
    if not settings.RAPID_API_KEY:
        raise RuntimeError("RAPID_API_KEY is not configured")
    url = f"https://{host}{path}"
    resp = httpx.get(url, headers=_headers(host), params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    return data if isinstance(data, dict) else {"data": data}


def _unavailable(mode: str) -> dict:
    return {
        "status": "unavailable",
        "mode": mode,
        "reason": "RAPID_API_KEY is not configured; returning estimates only.",
    }


@tool
def rapidapi_proxy(host: str, endpoint: str, params_json: str = "{}") -> str:
    """Generic RapidAPI passthrough: call any host/endpoint with JSON params. Returns JSON string."""
    try:
        params = json.loads(params_json or "{}")
    except json.JSONDecodeError:
        return json.dumps({"status": "error", "reason": "params_json is not valid JSON"})
    try:
        return json.dumps(rapidapi_get(host, endpoint, params), default=str)[:8000]
    except Exception as e:  # noqa: BLE001 - surface provider errors to the agent
        return json.dumps({"status": "error", "reason": str(e)[:500]})


@tool
def search_flights(origin_sky_id: str, dest_sky_id: str, date: str = "") -> str:
    """Search realtime flight prices via RapidAPI sky-scrapper. IDs come from searchAirport."""
    if not settings.RAPID_API_KEY:
        return json.dumps(_unavailable("flight"))
    try:
        params = {"originSkyId": origin_sky_id, "destinationSkyId": dest_sky_id}
        if date:
            params["date"] = date
        data = rapidapi_get(settings.RAPID_FLIGHT_HOST, "/api/v1/flights/searchFlights", params)
        return json.dumps(data, default=str)[:8000]
    except Exception as e:  # noqa: BLE001
        return json.dumps({"status": "error", "reason": str(e)[:500]})


@tool
def search_flight_airport(query: str) -> str:
    """Resolve a city/name to skyId + entityId for flight search (sky-scrapper searchAirport)."""
    if not settings.RAPID_API_KEY:
        return json.dumps(_unavailable("flight"))
    try:
        data = rapidapi_get(settings.RAPID_FLIGHT_HOST, "/api/v1/flights/searchAirport",
                            {"query": query})
        return json.dumps(data, default=str)[:4000]
    except Exception as e:  # noqa: BLE001
        return json.dumps({"status": "error", "reason": str(e)[:500]})


@tool
def search_trains(origin: str, destination: str, date: str = "") -> str:
    """Search train options via the configured RapidAPI train host. Returns JSON string."""
    if not settings.RAPID_API_KEY:
        return json.dumps(_unavailable("train"))
    try:
        data = rapidapi_get(settings.RAPID_TRAIN_HOST, "/api/trains/v2/search",
                            {"from": origin, "to": destination, "date": date})
        return json.dumps(data, default=str)[:8000]
    except Exception as e:  # noqa: BLE001
        return json.dumps({"status": "error", "reason": str(e)[:500]})


@tool
def search_buses(origin: str, destination: str, date: str = "") -> str:
    """Search bus options via the configured RapidAPI bus host. Returns JSON string."""
    if not settings.RAPID_API_KEY:
        return json.dumps(_unavailable("bus"))
    try:
        data = rapidapi_get(settings.RAPID_BUS_HOST, "/search",
                            {"from": origin, "to": destination, "date": date})
        return json.dumps(data, default=str)[:8000]
    except Exception as e:  # noqa: BLE001
        return json.dumps({"status": "error", "reason": str(e)[:500]})


@tool
def estimate_cab_fare(origin: str, destination: str, distance_km: float = 0) -> str:
    """Estimate cab fare with per-km slab rates (hatchback/sedan/SUV). No API key needed."""
    if distance_km <= 0:
        distance_km = 250.0  # fallback placeholder; supervisor overwrites when known
    slabs = {"hatchback": 11.0, "sedan": 13.0, "suv": 17.0}
    fares = {k: round(distance_km * r + 300, 2) for k, r in slabs.items()}
    return json.dumps({"status": "ok", "mode": "cab", "origin": origin,
                       "destination": destination, "distance_km": distance_km,
                       "fares_inr": fares, "source": "estimate"})
