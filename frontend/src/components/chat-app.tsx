"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import dynamic from "next/dynamic";

import { AgentMark, AgentNotes, Dots, ToolRow } from "@/components/chat-ui";
import { TripBoard } from "@/components/trip-board";
import { useTripPlanner } from "@/lib/use-trip-planner";
import type { PlanMsg } from "@/lib/use-trip-planner";

/* The 3D globe is client-only; preload it in the welcome panel too. */
const Globe3D = dynamic(() => import("@/components/globe-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0c2440] to-[#1c6cb4] text-[12px] text-white/60">
      Loading globe…
    </div>
  ),
});

const STATUS = {
  checking: { dot: "bg-[#c9cfc7]", label: "Connecting to agent…" },
  live: { dot: "bg-success", label: "Live · trip engine connected" },
  offline: { dot: "bg-clay", label: "Offline · start the backend to plan" },
} as const;

const SUGGESTIONS = [
  "Plan a 3 day trip to Jaipur",
  "5 days in Paris for 2 — food and culture",
  "Where should I go in Goa for a beach holiday?",
  "Compare flights and trains from Delhi to Mumbai",
];

function IconArrowUp({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 14V2M8 2 3 7M8 2l5 5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AgentBubble({ m }: { m: Extract<PlanMsg, { role: "agent" }> }) {
  return (
    <div className="animate-slide-in flex gap-2.5">
      <AgentMark size={26} />
      <div className="min-w-0 max-w-[92%] rounded-[16px] rounded-tl-[6px] border border-line-card bg-white px-4 py-3">
        {m.lead && <p className="text-[14.5px] leading-snug font-medium text-ink">{m.lead}</p>}
        {m.tools.length > 0 && (
          <ul className="mt-2.5 space-y-1.5">
            {m.tools.map((t, i) => (
              <ToolRow key={`${t.label}-${i}`} tool={t} done />
            ))}
          </ul>
        )}
        {m.text && (
          <p className="mt-2.5 text-[14px] leading-relaxed whitespace-pre-wrap text-ink/75">{m.text}</p>
        )}
        {m.followUps.length > 0 && (
          <ul className="mt-2.5 space-y-1 rounded-[10px] border border-line-pill bg-paper p-2.5">
            {m.followUps.map((q) => (
              <li key={q} className="flex gap-2 text-[13px] text-ink/70">
                <span className="text-[#1c6cb4]">?</span>
                {q}
              </li>
            ))}
          </ul>
        )}
        {m.hasPlan && (
          <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#34a853]/10 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.4px] text-[#2c8a44] uppercase">
            ✓ Trip board updated →
          </p>
        )}
        <AgentNotes notes={[...m.notes, ...m.errors]} />
      </div>
    </div>
  );
}

export function ChatApp() {
  const { messages, tripPlan, memory, status, sending, send, newTrip } = useTripPlanner();
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  function say(text: string) {
    const value = text.trim();
    if (!value || sending) return;
    void send(value);
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      say(draft);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* status strip */}
      <div className="z-40 border-b border-line-card bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-5 py-2.5">
          <p className="flex items-center gap-2 text-[12.5px] text-ink/60">
            <span className={`h-[7px] w-[7px] rounded-full ${STATUS[status].dot}`} aria-hidden="true" />
            {STATUS[status].label}
          </p>
          <div className="flex items-center gap-2">
            {memory.long.home_city && (
              <span className="hidden rounded-full border border-line-pill bg-white px-2.5 py-1 font-mono text-[10.5px] text-ink/55 sm:block">
                🏠 {memory.long.home_city}
              </span>
            )}
            <button
              type="button"
              onClick={newTrip}
              className="rounded-full border border-line-pill bg-white px-3 py-1.5 text-[12px] text-ink/65 transition hover:border-ink hover:text-ink"
            >
              New trip
            </button>
          </div>
        </div>
      </div>

      {/* two-pane planner */}
      <div className="mx-auto grid w-full max-w-[1440px] min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        {/* ---- conversation ---- */}
        <section className="flex min-h-0 flex-col border-line-card lg:border-r">
          <div ref={scrollerRef} className="thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
            {empty && (
              <section className="pt-2">
                <p className="font-mono text-[10.5px] tracking-[1.2px] text-[#1c6cb4] uppercase">Trip agent</p>
                <h2 className="mt-2 text-[clamp(26px,4vw,38px)] leading-[1.05] font-medium tracking-[-0.4px] text-ink">
                  Plan an entire trip by chatting.
                </h2>
                <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-ink/60">
                  Tell me a place and roughly how long. I&apos;ll research famous places, food, hotels and
                  transport — and lay it all out day by day on a live map.
                </p>
                <div className="mt-5 space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => say(s)}
                      className="block w-full rounded-[12px] border border-line-card bg-white px-3.5 py-2.5 text-left text-[13.5px] text-ink/75 transition hover:border-[#1c6cb4]/45 hover:text-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="space-y-4">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="animate-slide-in max-w-[80%] rounded-[16px] rounded-br-[6px] bg-brand-deep px-4 py-2.5 text-[14.5px] leading-relaxed text-white whitespace-pre-wrap">
                      {m.text}
                    </p>
                  </div>
                ) : (
                  <AgentBubble key={m.id} m={m} />
                ),
              )}

              {sending && (
                <div className="animate-slide-in flex gap-2.5">
                  <AgentMark size={26} />
                  <p className="flex items-center gap-2 text-[14px] text-ink/55">
                    <Dots /> Researching places, food, stays &amp; transport…
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* composer */}
          <div className="sticky bottom-0 border-t border-line-card bg-paper/95 px-5 py-3.5 backdrop-blur-sm">
            {!empty && messages.length <= 3 && (
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {SUGGESTIONS.slice(0, 3).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={sending}
                    onClick={() => say(s)}
                    className="rounded-full border border-line-pill bg-white px-3 py-1.5 text-[12px] text-ink/65 transition hover:border-ink hover:text-ink disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="rounded-[14px] border border-line-card bg-white p-2 pl-3.5 focus-within:border-ink">
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                }}
                onKeyDown={onKey}
                disabled={sending}
                aria-label="Message the trip agent"
                placeholder={sending ? "The agent is working…" : "Where to, and how long?"}
                className="block max-h-[160px] w-full resize-none border-0 bg-transparent py-2 text-[14.5px] leading-relaxed text-ink placeholder:text-ink/40 focus:ring-0 focus:outline-none"
              />
              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  onClick={() => say(draft)}
                  disabled={!draft.trim() || sending}
                  aria-label="Send message"
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-ink text-white transition hover:bg-brand-deep disabled:opacity-30"
                >
                  <IconArrowUp />
                </button>
              </div>
            </div>
            <p className="mt-2 font-mono text-[10px] tracking-[0.5px] text-ink/35 uppercase">
              Enter to send · Shift+Enter for a new line · memory saved locally
            </p>
          </div>
        </section>

        {/* ---- trip board / welcome ---- */}
        <section className="thin-scroll min-h-0 overflow-y-auto bg-sunken/40 px-5 py-5">
          {tripPlan ? (
            <TripBoard plan={tripPlan} />
          ) : (
            <div className="flex h-full flex-col">
              <div className="relative h-64 overflow-hidden rounded-[18px] border border-line-card bg-gradient-to-br from-[#0c2440] via-[#10324f] to-[#1c6cb4]">
                <Globe3D />
                <div className="pointer-events-none absolute bottom-4 left-4 text-white">
                  <p className="font-mono text-[10.5px] tracking-[1.2px] text-white/60 uppercase">Explore anywhere</p>
                  <p className="mt-1 text-[18px] font-medium">Spin the globe · pick a place</p>
                </div>
              </div>
              <div className="mt-5 rounded-[18px] border border-line-card bg-white p-5">
                <p className="font-mono text-[10.5px] tracking-[1.2px] text-[#1c6cb4] uppercase">What you get</p>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[
                    ["🗺️", "Route + 3D globe", "Origin→destination arc on an interactive globe and city map."],
                    ["📅", "Day-by-day plan", "Ask for “3 days” and get a start-to-end itinerary."],
                    ["🍽️", "Food & stays", "Real restaurants and hotels with photos."],
                    ["🚆", "Transport", "Flights, trains, buses and cabs with estimates."],
                  ].map(([icon, k, v]) => (
                    <li key={k} className="flex gap-3">
                      <span className="text-xl">{icon}</span>
                      <span>
                        <span className="block text-[13.5px] font-medium text-ink">{k}</span>
                        <span className="block text-[12.5px] leading-snug text-ink/55">{v}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {(memory.long.past_destinations.length > 0 || memory.long.interests.length > 0) && (
                <div className="mt-4 rounded-[18px] border border-line-card bg-white p-5">
                  <p className="font-mono text-[10.5px] tracking-[1.2px] text-ink/45 uppercase">Remembered about you</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {memory.long.home_city && (
                      <span className="rounded-full bg-paper px-2.5 py-1 text-[12px] text-ink/70">🏠 {memory.long.home_city}</span>
                    )}
                    {memory.long.interests.map((i) => (
                      <span key={i} className="rounded-full bg-paper px-2.5 py-1 text-[12px] text-ink/70 capitalize">{i}</span>
                    ))}
                    {memory.long.past_destinations.slice(-4).map((d) => (
                      <span key={d} className="rounded-full bg-paper px-2.5 py-1 text-[12px] text-ink/70">📍 {d}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default ChatApp;
