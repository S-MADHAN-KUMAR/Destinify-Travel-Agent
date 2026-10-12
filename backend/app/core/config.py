from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "Destinify API"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "local"
    BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # --- LLM (Groq) ---
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
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


settings = Settings()
