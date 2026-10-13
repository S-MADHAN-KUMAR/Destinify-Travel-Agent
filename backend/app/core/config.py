from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "Destinify API"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "local"

    # Browsers the Next.js dev server runs on (3000/3001). Accepts either a
    # comma-separated string or a JSON list from the env file.
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://localhost:3001",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        text = value.strip()
        if text.startswith("["):
            import json

            return json.loads(text)
        return [origin.strip() for origin in text.split(",") if origin.strip()]

    # --- LLM (Groq) ---
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    # Generic OpenAI-compatible fallback (LLM_BASE_URL + LLM_MODEL + LLM_API_KEY)
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = ""
    LLM_MODEL: str = ""

    # --- RapidAPI (realtime price tools for flight/train/bus/cab subagents) ---
    # One key, many APIs: each subagent targets a host subscribed in RapidAPI.
    # Hosts are configurable because they depend on which RapidAPI plans you enabled.
    RAPID_API_KEY: str = ""
    RAPID_FLIGHT_HOST: str = "sky-scrapper.p.rapidapi.com"
    RAPID_TRAIN_HOST: str = "irctc1.p.rapidapi.com"
    RAPID_BUS_HOST: str = "bus-booking.p.rapidapi.com"

    # --- OTD Delhi open-transit realtime (GTFS-RT VehiclePositions.pb) ---
    OTD_DELHI_API: str = ""
    OTD_REALTIME_URL: str = "https://otd.delhi.gov.in/api/realtime/VehiclePositions.pb"

    # --- Free geodata (no key required; the agent works fully without any of these) ---
    # OpenStreetMap Overpass -> real attractions / restaurants / hotels by city.
    # The main instance is often busy, so we keep a mirror failover list.
    OVERPASS_URL: str = "https://overpass-api.de/api/interpreter"
    OVERPASS_MIRRORS: Annotated[list[str], NoDecode] = [
        "https://overpass.openstreetmap.fr/api/interpreter",
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    ]

    @field_validator("OVERPASS_MIRRORS", mode="before")
    @classmethod
    def parse_overpass_mirrors(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        text = value.strip()
        if text.startswith("["):
            import json

            return json.loads(text)
        return [u.strip() for u in text.split(",") if u.strip()]
    # Nominatim -> geocode a city to lat/lon for the map + route arc.
    NOMINATIM_URL: str = "https://nominatim.openstreetmap.org/search"
    # Polite User-Agent required by OSM/Wikimedia usage policies. Wikimedia
    # 403s anything without a contact URL + email in the UA, so keep that shape.
    GEO_USER_AGENT: str = "DestinifyTripAgent/1.0 (https://github.com/destinify/destinify; destinify-dev@users.noreply.github.com)"
    # Wikipedia REST summary -> real thumbnails for famous places / eateries.
    WIKIPEDIA_SUMMARY_URL: str = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
    WIKIMEDIA_COMMONS_SEARCH_URL: str = "https://commons.wikimedia.org/w/api.php"
    # Openverse -> free CC image search (great for restaurants/hotels that have
    # no Wikipedia article). No key required for basic, rate-limited use.
    OPENVERSE_IMAGES_URL: str = "https://api.openverse.org/v1/images/"

    # --- Optional rich providers (auto-upgrade: used only when a key is set) ---
    YELP_API_KEY: str = ""          # restaurants + photos (Yelp Fusion v3)
    AMADEUS_KEY: str = ""           # flights + hotels (Amadeus self-service, free test env)
    AMADEUS_SECRET: str = ""
    AMADEUS_HOST: str = "https://test.api.amadeus.com"

    # How many recent turns count as short-term memory, and the in-process
    # geodata cache TTL (seconds) so we don't hammer the free endpoints.
    SHORT_MEMORY_TURNS: int = 12
    GEO_CACHE_TTL_SECONDS: int = 6 * 3600


settings = Settings()
