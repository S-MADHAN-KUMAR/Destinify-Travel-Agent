/**
 * Destinify backend client.
 *
 * Backend: FastAPI app in `backend/` — every route is mounted under
 * `/api/v1`. The dev server runs on :3000, which the API allows via CORS.
 *
 *   NEXT_PUBLIC_API_URL   defaults to http://localhost:8000
 */

export type TravelMode = "train" | "flight" | "bus" | "cab" | "transit";

/** `TravelDetails` — the classifier's typed extraction. */
export type TravelDetails = {
  origin: string | null;
  destination: string | null;
  travel_date: string | null;
  return_date: string | null;
  passengers: number;
  budget_inr: number | null;
  preferred_modes: TravelMode[];
  intent: "travel_search" | "price_check" | "booking_help" | "other";
  confidence: number;
  raw_message?: string;
};

/** `TravelOption` — one row a mode subagent appended. */
export type TravelOption = {
  mode: TravelMode;
  title: string;
  price_inr: number | null;
  currency: string;
  duration_min: number | null;
  provider: string | null;
  source: "rapidapi" | "otd_delhi" | "estimate" | "llm";
  details: Record<string, unknown>;
  note: string;
};

/** `ChatResponse` — POST /api/v1/chat */
export type ChatResponse = {
  details: TravelDetails;
  missing_fields: string[];
  follow_up_questions: string[];
  needs_follow_up: boolean;
  selected_modes: TravelMode[];
  options: TravelOption[];
  notes: string[];
  errors: string[];
};

export type HealthResponse = { status: string };

export type ChatConfig = {
  groq_configured: boolean;
  groq_model: string;
  rapidapi_configured: boolean;
  otd_delhi_configured: boolean;
};

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 45_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init.headers },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new ApiError(`${res.status} ${res.statusText}`, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e instanceof Error ? e.message : "Network error");
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  /** GET /api/v1/health — cheap liveness probe, short timeout. */
  health: () => request<HealthResponse>("/api/v1/health", {}, 4_000),

  /** GET /api/v1/chat/config — which realtime keys are wired (booleans only). */
  chatConfig: () => request<ChatConfig>("/api/v1/chat/config", {}, 4_000),

  /** POST /api/v1/chat — runs classifier → supervisor → mode subagents. */
  sendChat: (message: string) =>
    request<ChatResponse>(
      "/api/v1/chat",
      { method: "POST", body: JSON.stringify({ message }) },
      60_000,
    ),
};
