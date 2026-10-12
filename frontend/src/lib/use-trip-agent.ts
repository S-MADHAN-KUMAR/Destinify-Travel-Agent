"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { TravelDetails } from "@/lib/api";
import { composeMessage, mapChatResponse } from "@/lib/agent-bridge";
import { BRIEF, replyFor } from "@/lib/trip-chat";
import type { Brief, Msg, Pending } from "@/lib/trip-chat";

/**
 * Shared trip-agent conversation engine for both chat surfaces
 * (`/chat` full-screen and the landing-page section).
 *
 * Send → POST /api/v1/chat → animate the reply (thinking → tools → typing).
 * If the backend is unreachable it falls back to the bundled scripted agent
 * and reports `status: "demo"`, so the UI never dead-ends.
 */

export type AgentStatus = "checking" | "live" | "demo";

type TripAgentOptions = {
  /** Thread to return to on reset (defaults to `seed`). */
  opening?: Msg[];
  /** Starting trip brief (defaults to the seeded demo brief). */
  brief?: Brief;
};

export function useTripAgent(seed: Msg[], options: TripAgentOptions = {}) {
  const opening = options.opening ?? seed;
  const startBrief = options.brief ?? BRIEF;

  const [thread, setThread] = useState<Msg[]>(seed);
  const [pending, setPending] = useState<Pending | null>(null);
  const [brief, setBrief] = useState<Brief>(startBrief);
  const [held, setHeld] = useState<string[]>([]);
  const [status, setStatus] = useState<AgentStatus>("checking");
  const idRef = useRef(0);
  /** What the classifier knows about the trip so far (for follow-up turns). */
  const detailsRef = useRef<TravelDetails | null>(null);

  const uid = () => `m${++idRef.current}`;
  const busy = pending !== null;

  /* --- liveness probe: is the FastAPI backend reachable? ---------- */
  useEffect(() => {
    let alive = true;
    api
      .health()
      .then(() => alive && setStatus("live"))
      .catch(() => alive && setStatus("demo"));
    return () => {
      alive = false;
    };
  }, []);

  /* --- staged reply animation ------------------------------------- */
  useEffect(() => {
    if (!pending || pending.phase !== "reply") return;
    const p = pending;

    if (p.step === "thinking") {
      const t = setTimeout(
        () => setPending((v) => (v && v.phase === "reply" ? { ...v, step: "tools" } : v)),
        700,
      );
      return () => clearTimeout(t);
    }

    if (p.step === "tools") {
      if (p.toolIndex >= p.reply.tools.length) {
        const t = setTimeout(
          () => setPending((v) => (v && v.phase === "reply" ? { ...v, step: "answer" } : v)),
          300,
        );
        return () => clearTimeout(t);
      }
      const t = setTimeout(
        () =>
          setPending((v) =>
            v && v.phase === "reply" ? { ...v, toolIndex: v.toolIndex + 1 } : v,
          ),
        640,
      );
      return () => clearTimeout(t);
    }

    if (p.step === "answer") {
      const iv = setInterval(() => {
        setPending((v) => {
          if (!v || v.phase !== "reply") return v;
          const next = v.shown + 3;
          if (next >= v.reply.text.length) {
            return { ...v, shown: v.reply.text.length, step: "done" };
          }
          return { ...v, shown: next };
        });
      }, 16);
      return () => clearInterval(iv);
    }

    const t = setTimeout(() => {
      setThread((prev) => [
        ...prev,
        {
          id: uid(),
          role: "agent",
          lead: p.reply.lead,
          tools: p.reply.tools,
          text: p.reply.text,
          card: p.reply.card,
          notes: p.reply.notes,
        },
      ]);
      setPending(null);
    }, 320);
    return () => clearTimeout(t);
  }, [pending]);

  /* --- talk to the backend, fall back to the scripted agent ------- */
  async function send(text: string) {
    const value = text.trim();
    if (!value || busy) return false;

    setThread((prev) => [...prev, { id: uid(), role: "user", text: value }]);
    setPending({ phase: "calling" });

    try {
      const res = await api.sendChat(composeMessage(value, detailsRef.current));
      detailsRef.current = res.details;
      const reply = mapChatResponse(res);
      setStatus("live");
      if (reply.brief) setBrief((b) => ({ ...b, ...reply.brief }));
      setPending({ phase: "reply", reply, step: "thinking", toolIndex: 0, shown: 0 });
    } catch {
      const reply = replyFor(value);
      setStatus("demo");
      if (reply.brief) setBrief((b) => ({ ...b, ...reply.brief }));
      setPending({ phase: "reply", reply, step: "thinking", toolIndex: 0, shown: 0 });
    }
    return true;
  }

  function reset() {
    setThread(opening);
    setPending(null);
    setBrief(startBrief);
    setHeld([]);
    detailsRef.current = null;
  }

  function toggleHold(name: string) {
    setHeld((h) => (h.includes(name) ? h.filter((n) => n !== name) : [...h, name]));
  }

  return { thread, pending, brief, held, status, busy, send, reset, toggleHold };
}
