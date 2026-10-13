"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { getSessionId, loadMemory, loadPlan, saveMemory, savePlan } from "@/lib/memory";
import { EMPTY_LONG_MEMORY } from "@/lib/trip-types";
import type { MemoryPayload, ToolTrace, TripPlan } from "@/lib/trip-types";

/**
 * The production trip-planner conversation engine (used by `/chat`).
 *
 * Sends each message with the persisted long/short-term memory (localStorage),
 * receives an all-in-one TripPlan back, and writes the updated memory straight
 * to localStorage so context survives reloads and new trips.
 */

export type PlanMsg =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "agent";
      lead: string;
      text: string;
      tools: ToolTrace[];
      notes: string[];
      errors: string[];
      followUps: string[];
      hasPlan: boolean;
    };

export type PlanStatus = "checking" | "live" | "offline";

export function useTripPlanner() {
  const [messages, setMessages] = useState<PlanMsg[]>([]);
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [memory, setMemory] = useState<MemoryPayload>({
    short: [],
    long: { ...EMPTY_LONG_MEMORY },
  });
  const [status, setStatus] = useState<PlanStatus>("checking");
  const [sending, setSending] = useState(false);
  const sessionRef = useRef<string>("ssr");
  const idRef = useRef(0);
  const hydrated = useRef(false);

  const uid = () => `p${++idRef.current}`;

  /* --- hydrate memory + session (client-only, after mount) --------- */
  useEffect(() => {
    sessionRef.current = getSessionId();
    setMemory(loadMemory());
    setTripPlan(loadPlan()); // restore the board after a reload
    hydrated.current = true;
    let alive = true;
    api
      .health()
      .then(() => alive && setStatus("live"))
      .catch(() => alive && setStatus("offline"));
    return () => {
      alive = false;
    };
  }, []);

  const send = useCallback(
    async (text: string) => {
      const value = text.trim();
      if (!value || sending) return;

      setMessages((prev) => [...prev, { id: uid(), role: "user", text: value }]);
      setSending(true);

      try {
        const res = await api.sendChat(value, sessionRef.current, memory);
        setStatus("live");
        setMemory(res.memory);
        saveMemory(res.memory); // persist long + short term memory
        if (res.trip_plan) {
          setTripPlan(res.trip_plan);
          savePlan(res.trip_plan);
        }
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "agent",
            lead: res.reply_lead,
            text: res.reply_text,
            tools: res.tools,
            notes: res.notes,
            errors: res.errors,
            followUps: res.needs_follow_up ? res.follow_up_questions : [],
            hasPlan: Boolean(res.trip_plan),
          },
        ]);
      } catch {
        setStatus("offline");
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "agent",
            lead: "I couldn't reach the trip engine.",
            text: "The backend isn't running. Start it (uvicorn app.main:app in backend/) and try again — your trip context is saved locally.",
            tools: [],
            notes: [],
            errors: ["backend unreachable"],
            followUps: [],
            hasPlan: false,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [memory, sending],
  );

  /** Start a fresh trip but KEEP the durable long-term profile. */
  const newTrip = useCallback(() => {
    setMessages([]);
    setTripPlan(null);
    savePlan(null);
  }, []);

  return { messages, tripPlan, memory, status, sending, send, newTrip };
}
