/**
 * Destinify backend client.
 *
 * Backend: FastAPI app in `backend/` — every route is mounted under
 * `/api/v1`. The dev server runs on :3000, which the API allows via CORS.
 *
 *   NEXT_PUBLIC_API_URL   defaults to http://localhost:8000
 */

import type { ChatConfig, ChatResponse, HealthResponse, MemoryPayload } from "@/lib/trip-types";

export type { ChatConfig, ChatResponse, HealthResponse, MemoryPayload };

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

  /** GET /api/v1/chat/config — which providers are wired (booleans only). */
  chatConfig: () => request<ChatConfig>("/api/v1/chat/config", {}, 4_000),

  /** POST /api/v1/chat — runs the memory-aware all-in-one trip graph. */
  sendChat: (message: string, sessionId: string, memory: MemoryPayload | null) =>
    request<ChatResponse>(
      "/api/v1/chat",
      {
        method: "POST",
        body: JSON.stringify({ message, session_id: sessionId, memory }),
      },
      // Research (Overpass + Wikipedia + images) plus the LLM planner can take
      // a while on a cold cache; give it room before giving up.
      180_000,
    ),
};
