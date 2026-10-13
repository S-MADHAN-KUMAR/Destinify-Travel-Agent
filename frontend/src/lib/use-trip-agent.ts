"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { BRIEF, replyFor } from "@/lib/trip-chat";
import type { Brief, Msg, Pending } from "@/lib/trip-chat";

/**
 * Scripted trip-agent engine for the LANDING page's product-tour section.
 *
 * It renders a canned (but polished) conversation so the marketing page never
 * dead-ends, and probes the backend only to show a live/demo status dot. The
 * real, memory-aware agent lives on `/chat` (see `use-trip-planner`).
 */

export type AgentStatus = "checking" | "live" | "demo";

type TripAgentOptions = {
  opening?: Msg[];
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
        600,
      );
      return () => clearTimeout(t);
    }

    if (p.step === "tools") {
      if (p.toolIndex >= p.reply.tools.length) {
        const t = setTimeout(
          () => setPending((v) => (v && v.phase === "reply" ? { ...v, step: "answer" } : v)),
          250,
        );
        return () => clearTimeout(t);
      }
      const t = setTimeout(
        () =>
          setPending((v) =>
            v && v.phase === "reply" ? { ...v, toolIndex: v.toolIndex + 1 } : v,
          ),
        520,
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
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  /* --- scripted reply (no backend call on the landing page) ------- */
  async function send(text: string) {
    const value = text.trim();
    if (!value || busy) return false;

    setThread((prev) => [...prev, { id: uid(), role: "user", text: value }]);
    setPending({ phase: "calling" });

    const reply = replyFor(value);
    setStatus("demo");
    if (reply.brief) setBrief((b) => ({ ...b, ...reply.brief }));
    setPending({ phase: "reply", reply, step: "thinking", toolIndex: 0, shown: 0 });
    return true;
  }

  function reset() {
    setThread(opening);
    setPending(null);
    setBrief(startBrief);
    setHeld([]);
  }

  function toggleHold(name: string) {
    setHeld((h) => (h.includes(name) ? h.filter((n) => n !== name) : [...h, name]));
  }

  return { thread, pending, brief, held, status, busy, send, reset, toggleHold };
}
