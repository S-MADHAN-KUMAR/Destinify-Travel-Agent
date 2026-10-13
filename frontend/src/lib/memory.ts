"use client";

/**
 * Long + short-term memory, persisted in localStorage.
 *
 *  * Short-term memory: the last N turns of the current thread (rolling).
 *  * Long-term memory: a durable profile (home city, interests, budget style,
 *    past destinations) that survives reloads and new trips.
 *
 * The backend treats this payload as the source of truth and returns the
 * updated version each turn; we write it straight back. A stable `sessionId`
 * gives the server a memory fallback even if the client payload is cleared.
 */

import { EMPTY_LONG_MEMORY } from "@/lib/trip-types";
import type { LongMemory, MemoryPayload, ShortTurn } from "@/lib/trip-types";

const MEM_KEY = "destinify.memory.v1";
const SESSION_KEY = "destinify.session.v1";
const MAX_SHORT = 24; // keep localStorage bounded

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "volatile";
  }
}

export function loadMemory(): MemoryPayload {
  if (typeof window === "undefined") return { short: [], long: { ...EMPTY_LONG_MEMORY } };
  try {
    const raw = window.localStorage.getItem(MEM_KEY);
    const parsed = safeParse<Partial<MemoryPayload>>(raw, {});
    const long: LongMemory = { ...EMPTY_LONG_MEMORY, ...(parsed.long ?? {}) };
    const short: ShortTurn[] = Array.isArray(parsed.short) ? parsed.short.slice(-MAX_SHORT) : [];
    return { short, long };
  } catch {
    return { short: [], long: { ...EMPTY_LONG_MEMORY } };
  }
}

export function saveMemory(mem: MemoryPayload): void {
  if (typeof window === "undefined") return;
  try {
    const bounded: MemoryPayload = {
      short: mem.short.slice(-MAX_SHORT),
      long: { ...EMPTY_LONG_MEMORY, ...mem.long },
    };
    window.localStorage.setItem(MEM_KEY, JSON.stringify(bounded));
  } catch {
    /* storage full / private mode — ignore, memory just won't persist */
  }
}

export function clearMemory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MEM_KEY);
  } catch {
    /* ignore */
  }
}
