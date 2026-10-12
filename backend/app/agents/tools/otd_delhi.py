"""OTD Delhi realtime transit tool (GTFS-RT VehiclePositions.pb).

Authorized endpoint (per OTD docs):
    GET https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb?key=YOUR_PRIVATE_KEY
Key is read from settings.OTD_DELHI_API (env OTD_DELHI_API); never logged.
"""

from __future__ import annotations

import httpx
from langchain_core.tools import tool

from app.core.config import settings

TIMEOUT = 20.0


def fetch_vehicle_positions(limit_routes: int = 10) -> dict:
    """Fetch + parse GTFS-RT vehicle positions. Returns summary dict (no key leakage)."""
    if not settings.OTD_DELHI_API:
        return {"status": "unavailable", "reason": "OTD_DELHI_API is not configured"}
    try:
        from google.transit import gtfs_realtime_pb2
    except ImportError:
        return {"status": "error", "reason": "gtfs-realtime-bindings is not installed"}
    try:
        resp = httpx.get(settings.OTD_REALTIME_URL,
                         params={"key": settings.OTD_DELHI_API}, timeout=TIMEOUT)
        resp.raise_for_status()
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(resp.content)
        routes: dict[str, int] = {}
        total = 0
        sample = []
        for entity in feed.entity:
            if not entity.HasField("vehicle"):
                continue
            total += 1
            route_id = entity.vehicle.trip.route_id or "unknown"
            routes[route_id] = routes.get(route_id, 0) + 1
            if len(sample) < 5 and entity.vehicle.HasField("position"):
                sample.append({
                    "vehicle_id": entity.vehicle.vehicle.id or entity.id,
                    "route_id": route_id,
                    "lat": round(entity.vehicle.position.latitude, 5),
                    "lon": round(entity.vehicle.position.longitude, 5),
                })
        top_routes = sorted(routes.items(), key=lambda kv: kv[1], reverse=True)[:limit_routes]
        return {"status": "ok", "vehicles_total": total,
                "routes_active": len(routes),
                "top_routes": [{"route_id": r, "vehicles": c} for r, c in top_routes],
                "sample": sample, "source": "otd_delhi"}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "reason": str(e)[:500]}


@tool
def delhi_transit_realtime() -> str:
    """Get live Delhi bus/vehicle positions from OTD GTFS-RT feed. Returns JSON string."""
    import json

    return json.dumps(fetch_vehicle_positions(), default=str)[:6000]
