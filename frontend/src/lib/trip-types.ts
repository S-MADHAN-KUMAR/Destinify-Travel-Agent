/**
 * Shared trip-agent contract — mirrors the FastAPI backend's Pydantic models
 * (`app/agents/state.py`). One typed shape for the whole all-in-one trip plan.
 */

export type TravelMode = "flight" | "train" | "bus" | "cab" | "metro" | "walk";
export type Capability = "attractions" | "food" | "stay" | "transport";
export type TripIntent =
  | "trip_plan"
  | "transport_search"
  | "food_search"
  | "stay_search"
  | "general";

export type GeoPoint = { lat: number; lon: number; label?: string };

export type TravelDetails = {
  origin: string | null;
  destination: string | null;
  days: number | null;
  start_date: string | null;
  end_date: string | null;
  travellers: number;
  budget_inr: number | null;
  interests: string[];
  pace: "relaxed" | "balanced" | "packed";
  trip_type: string;
  intent: TripIntent;
  confidence: number;
  raw_message?: string;
};

export type Place = {
  name: string;
  category: string;
  lat: number | null;
  lon: number | null;
  image_url: string | null;
  description: string;
  rating: number | null;
  price_level: string | null;
  opening_hours: string | null;
  wiki_url: string | null;
  source: string;
};

export type Restaurant = {
  name: string;
  cuisine: string;
  lat: number | null;
  lon: number | null;
  image_url: string | null;
  price_level: string | null;
  rating: number | null;
  description: string;
  source: string;
};

export type Hotel = {
  name: string;
  lat: number | null;
  lon: number | null;
  image_url: string | null;
  price_inr: number | null;
  rating: number | null;
  description: string;
  amenities: string[];
  source: string;
};

export type TransportOption = {
  mode: TravelMode;
  title: string;
  price_inr: number | null;
  currency: string;
  duration_min: number | null;
  provider: string | null;
  departure: string | null;
  arrival: string | null;
  image_url: string | null;
  source: string;
  details: Record<string, unknown>;
  note: string;
};

export type DayActivity = {
  slot: "morning" | "afternoon" | "evening";
  title: string;
  place: string;
  lat: number | null;
  lon: number | null;
  image_url: string | null;
  description: string;
  duration_hours: number | null;
};

export type DayMeals = { breakfast?: string | null; lunch?: string | null; dinner?: string | null };

export type DayPlan = {
  day: number;
  date: string | null;
  theme: string;
  activities: DayActivity[];
  meals: DayMeals;
  stay: string | null;
  transport: string | null;
  summary: string;
};

export type BudgetBreakdown = {
  transport_inr: number;
  stay_inr: number;
  food_inr: number;
  activities_inr: number;
  misc_inr: number;
  total_inr: number;
  currency: string;
  note: string;
};

export type MapPin = {
  lat: number;
  lon: number;
  label: string;
  kind: "origin" | "destination" | "attraction" | "restaurant" | "hotel" | "activity";
  day: number | null;
  image_url: string | null;
};

export type TripPlan = {
  destination: string;
  origin: string | null;
  days: number;
  travellers: number;
  route_summary: string;
  itinerary: DayPlan[];
  attractions: Place[];
  restaurants: Restaurant[];
  hotels: Hotel[];
  transport: TransportOption[];
  budget: BudgetBreakdown;
  map_center: GeoPoint | null;
  origin_geo: GeoPoint | null;
  map_pins: MapPin[];
  highlights: string[];
  tips: string[];
};

/* ------------------------- memory (localStorage) ------------------------- */

export type ShortTurn = { role: "user" | "agent"; text: string };

export type LongMemory = {
  home_city: string | null;
  interests: string[];
  budget_style: "budget" | "mid" | "luxury" | "unknown";
  preferred_modes: TravelMode[];
  past_destinations: string[];
  travellers: number | null;
  notes: string;
};

export type MemoryPayload = { short: ShortTurn[]; long: LongMemory };

/* ------------------------------ API shapes ------------------------------ */

export type ToolTrace = { label: string; detail: string };

export type ChatResponse = {
  reply_lead: string;
  reply_text: string;
  details: TravelDetails;
  trip_plan: TripPlan | null;
  memory: MemoryPayload;
  needs_follow_up: boolean;
  follow_up_questions: string[];
  capabilities: Capability[];
  tools: ToolTrace[];
  notes: string[];
  errors: string[];
};

export type HealthResponse = { status: string };

export type ChatConfig = {
  groq_configured: boolean;
  groq_model: string;
  rapidapi_configured: boolean;
  otd_delhi_configured: boolean;
  yelp_configured: boolean;
  amadeus_configured: boolean;
  free_geodata: boolean;
};

export const EMPTY_LONG_MEMORY: LongMemory = {
  home_city: null,
  interests: [],
  budget_style: "unknown",
  preferred_modes: [],
  past_destinations: [],
  travellers: null,
  notes: "",
};
