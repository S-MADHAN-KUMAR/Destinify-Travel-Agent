"""Optional rich providers that auto-upgrade the free stack when a key is set.

Free-first: the agent is fully functional on OpenStreetMap/Wikimedia/Openverse
alone. When you add a key, these give richer data:
  * Yelp Fusion  -> real restaurant photos + ratings (YELP_API_KEY)
  * Amadeus      -> real flight offers (AMADEUS_KEY + AMADEUS_SECRET)

Every function returns [] / None when its key is missing or the call fails, so
the research nodes can call them unconditionally and fall back to free sources.
"""

from __future__ import annotations

import logging

import httpx

from app.agents.state import Restaurant, TransportOption
from app.core.config import settings

logger = logging.getLogger(__name__)
_TIMEOUT = 20.0


# --------------------------------------------------------------------------- #
# Yelp Fusion — restaurants with real photos                                  #
# --------------------------------------------------------------------------- #

def yelp_restaurants(city: str, limit: int = 12) -> list[Restaurant]:
    """Real restaurants with photos/ratings via Yelp Fusion (needs YELP_API_KEY)."""
    if not settings.YELP_API_KEY:
        return []
    try:
        resp = httpx.get(
            "https://api.yelp.com/v3/businesses/search",
            headers={"Authorization": f"Bearer {settings.YELP_API_KEY}"},
            params={"term": "restaurants", "location": city, "limit": limit,
                    "sort_by": "best_match"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("yelp search failed: %s", exc)
        return []
    out: list[Restaurant] = []
    for b in data.get("businesses", []):
        coords = b.get("coordinates") or {}
        cats = ", ".join(c["title"] for c in b.get("categories", [])[:2])
        out.append(Restaurant(
            name=b.get("name", ""), cuisine=cats,
            lat=coords.get("latitude"), lon=coords.get("longitude"),
            image_url=b.get("image_url"), price_level=b.get("price"),
            rating=b.get("rating"),
            description=", ".join(b.get("location", {}).get("display_address", [])),
            source="yelp",
        ))
    return out


# --------------------------------------------------------------------------- #
# Amadeus — real flight offers (free test env)                                #
# --------------------------------------------------------------------------- #

_amadeus_token: dict[str, str] = {}


def _amadeus_token_value() -> str | None:
    if not (settings.AMADEUS_KEY and settings.AMADEUS_SECRET):
        return None
    if _amadeus_token.get("value"):
        return _amadeus_token["value"]
    try:
        resp = httpx.post(
            f"{settings.AMADEUS_HOST}/v1/security/oauth2/grant_type=client_credentials",
            data={"client_id": settings.AMADEUS_KEY, "client_secret": settings.AMADEUS_SECRET},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        _amadeus_token["value"] = resp.json().get("access_token", "")
        return _amadeus_token["value"]
    except Exception as exc:  # noqa: BLE001
        logger.warning("amadeus auth failed: %s", exc)
        return None


def _iata_code(query: str) -> str | None:
    """Best-effort city -> IATA via Amadeus location API (fallback: None)."""
    token = _amadeus_token_value()
    if not token:
        return None
    try:
        resp = httpx.get(
            f"{settings.AMADEUS_HOST}/v1/reference-data/locations",
            headers={"Authorization": f"Bearer {token}"},
            params={"keyword": query, "subType": "CITY,AIRPORT"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        if data:
            return data[0].get("iataCode")
    except Exception as exc:  # noqa: BLE001
        logger.warning("amadeus location lookup failed: %s", exc)
    return None


def amadeus_flights(origin: str, destination: str, date: str,
                    image_url: str | None) -> list[TransportOption]:
    """Real flight offers via Amadeus (needs AMADEUS_KEY + AMADEUS_SECRET)."""
    token = _amadeus_token_value()
    if not token:
        return []
    o, d = _iata_code(origin), _iata_code(destination)
    if not o or not d:
        return []
    params = {"originLocationCode": o, "destinationLocationCode": d, "adults": 1, "max": 6}
    if date:
        params["departureDate"] = date
    try:
        resp = httpx.get(
            f"{settings.AMADEUS_HOST}/v2/shopping/flight-offers",
            headers={"Authorization": f"Bearer {token}"},
            params=params, timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        offers = resp.json().get("data", [])
    except Exception as exc:  # noqa: BLE001
        logger.warning("amadeus flight search failed: %s", exc)
        return []
    out: list[TransportOption] = []
    for offer in offers[:6]:
        price = (offer.get("price") or {}).get("grandTotal")
        itin = (offer.get("itineraries") or [{}])[0]
        segments = itin.get("segments") or []
        carrier = ""
        if segments:
            carrier = (segments[0].get("carrierCode") or "")
        dur = itin.get("duration")
        minutes = None
        if dur and "H" in dur and "M" in dur:
            try:
                h = int(dur.split("H")[0].replace("PT", ""))
                m = int(dur.split("H")[1].replace("M", ""))
                minutes = h * 60 + m
            except ValueError:
                minutes = None
        out.append(TransportOption(
            mode="flight", title=f"{o} → {d} · {carrier}".strip(),
            price_inr=float(price) if price else None,
            duration_min=minutes, provider=carrier or "Airline",
            departure=segments[0].get("departure", {}).get("at") if segments else None,
            arrival=segments[-1].get("arrival", {}).get("at") if segments else None,
            image_url=image_url, source="amadeus",
        ))
    return out
