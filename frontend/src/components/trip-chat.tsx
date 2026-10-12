"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* types                                                               */
/* ------------------------------------------------------------------ */

type Tool = { label: string; detail: string };

type Card =
  | { kind: "itinerary"; title: string; rows: { k: string; v: string; note?: string }[] }
  | { kind: "options"; title: string; rows: { name: string; meta: string; price: string }[] }
  | { kind: "budget"; title: string; rows: { k: string; v: string }[]; total: string };

type Brief = {
  destination: string;
  dates: string;
  nights: string;
  travellers: string;
  budget: string;
};

type Reply = {
  lead: string;
  tools: Tool[];
  text: string;
  card?: Card;
  brief?: Partial<Brief>;
};

type Msg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "agent"; lead: string; tools: Tool[]; text: string; card?: Card };

type Pending = {
  reply: Reply;
  step: "thinking" | "tools" | "answer" | "done";
  toolIndex: number;
  shown: number;
};

/* ------------------------------------------------------------------ */
/* seed conversation + scripted agent                                  */
/* ------------------------------------------------------------------ */

const BRIEF: Brief = {
  destination: "Kyoto, Japan",
  dates: "Apr 2 – Apr 9",
  nights: "7 nights",
  travellers: "2 adults",
  budget: "¥280,000",
};

const SEED: Msg[] = [
  {
    id: "s1",
    role: "agent",
    lead: "I'm your trip agent. Tell me where you're headed, roughly when, and what the trip should feel like.",
    tools: [],
    text: "",
  },
  {
    id: "s2",
    role: "user",
    text: "Kyoto in early April, 7 days, 2 of us. Cherry blossoms but not a zoo.",
  },
  {
    id: "s3",
    role: "agent",
    lead: "Early April lands on peak bloom around Apr 2–8.",
    tools: [
      { label: "Searched flights", detail: "42 routes · HND/KIX" },
      { label: "Checked bloom forecast", detail: "10-yr phenology model" },
      { label: "Pulled stays", detail: "128 ryokans + hotels" },
    ],
    text: "I've held two mornings for the quiet side of the season — Nanzen-ji at 7am and the Kitayama cedar villages on a weekday. Everything else stays loose so we can chase the bloom as it moves north.",
    card: {
      kind: "itinerary",
      title: "Draft itinerary · 7 days",
      rows: [
        { k: "Day 1", v: "Land KIX · Haruka to Kyoto", note: "Check in Gion" },
        { k: "Day 2", v: "Nanzen-ji at sunrise · Philosopher's Path" },
        { k: "Day 3", v: "Arashiyama bamboo · Okochi Sanso garden" },
        { k: "Day 4", v: "Nishiki market crawl · Kiyomizu-dera at dusk" },
      ],
    },
  },
];

const SUGGESTIONS = [
  "7 days in Kyoto, food-first",
  "Cheapest warm week in March",
  "Long weekend in Lisbon",
  "Surprise us somewhere quiet",
];

function replyFor(input: string): Reply {
  const q = input.toLowerCase();

  if (/kyoto|japan|sakura|blossom/.test(q)) {
    return {
      lead: "Locking Kyoto in — here's the shape I'd give it.",
      tools: [
        { label: "Searched flights", detail: "42 routes · HND/KIX" },
        { label: "Matched stays", detail: "Gion · Higashiyama" },
      ],
      text: "I kept two mornings deliberately empty. Kyoto rewards the people who wander, and the crowds arrive at 9:30 — so the plan front-loads the temples and leaves the afternoons for food.",
      card: {
        kind: "itinerary",
        title: "Revised itinerary · 7 days",
        rows: [
          { k: "Day 1", v: "Land KIX · Haruka to Kyoto", note: "Check in Gion" },
          { k: "Day 2", v: "Nanzen-ji at sunrise · Philosopher's Path" },
          { k: "Day 3", v: "Arashiyama bamboo · Okochi Sanso garden" },
          { k: "Day 4", v: "Nishiki market crawl · Kiyomizu-dera at dusk" },
          { k: "Day 5", v: "Day trip to Nara · Deer park, Tōdai-ji" },
          { k: "Day 6", v: "Fushimi Inari before 7am · Sake district" },
          { k: "Day 7", v: "Slow morning · Kamo river · Fly out" },
        ],
      },
      brief: { destination: "Kyoto, Japan", dates: "Apr 2 – Apr 9", nights: "7 nights" },
    };
  }

  if (/lisbon|portugal/.test(q)) {
    return {
      lead: "Lisbon is cheapest mid-week, and March is the sweet spot.",
      tools: [
        { label: "Scanned fares", detail: "90 days · 6 airlines" },
        { label: "Compared stays", detail: "Alfama · Príncipe Real" },
      ],
      text: "Flying Tuesday saves about €180 each. I'd stay in Príncipe Real over Alfama — quieter at night, ten minutes by tram, and the food is better.",
      card: {
        kind: "options",
        title: "Cheapest options · 4 nights",
        rows: [
          { name: "TAP · direct, Tue departure", meta: "Out 07:40 · back 21:15", price: "€412 pp" },
          { name: "Casa do Jasmim, Príncipe Real", meta: "Breakfast · courtyard", price: "€96 / night" },
          { name: "Memmo Alfama", meta: "River view · terrace", price: "€148 / night" },
        ],
      },
      brief: { destination: "Lisbon, Portugal", dates: "Mar 10 – Mar 14", nights: "4 nights" },
    };
  }

  if (/oaxaca|food|eat|culinary/.test(q)) {
    return {
      lead: "Oaxaca, built around the table.",
      tools: [
        { label: "Reserved tastings", detail: "3 markets · 2 molinos" },
        { label: "Checked season", detail: "Mole · mezcal · chapulines" },
      ],
      text: "I've spaced the market mornings so nothing overlaps, and left one dinner unbooked — the best one is usually the place someone tells you about at lunch.",
      card: {
        kind: "itinerary",
        title: "Food itinerary · 5 days",
        rows: [
          { k: "Day 1", v: "Comida caldosa · tlayuda crawl, Centro" },
          { k: "Day 2", v: "Tlacolula market · mole negro tasting" },
          { k: "Day 3", v: "Mezcal distillery, Santiago Matatlán" },
          { k: "Day 4", v: "Cooking class · Hierve el Agua" },
        ],
      },
      brief: { destination: "Oaxaca, Mexico", dates: "Flexible", nights: "5 nights" },
    };
  }

  if (/warm|sun|beach|hot|surprise/.test(q)) {
    return {
      lead: "Three warm options that aren't crowded in March.",
      tools: [
        { label: "Filtered by climate", detail: ">24°C · low rainfall" },
        { label: "Filtered by crowds", detail: "Shoulder season only" },
      ],
      text: "All three are in their shoulder season, which means warm days, short queues, and rates about 30% under peak. Pick one and I'll build it out.",
      card: {
        kind: "options",
        title: "Somewhere warm",
        rows: [
          { name: "Essaouira, Morocco", meta: "26°C · Atlantic wind · kitesurfing", price: "€68 / night" },
          { name: "Cape Verde · São Vicente", meta: "28°C · dry season starts", price: "€94 / night" },
          { name: "Oaxaca, Mexico", meta: "29°C · festival season", price: "€72 / night" },
        ],
      },
      brief: { destination: "Undecided", dates: "March", nights: "5 nights" },
    };
  }

  if (/budget|price|cost|cheap|expensive/.test(q)) {
    return {
      lead: "Here's where the money actually goes.",
      tools: [
        { label: "Priced itinerary", detail: "Live rates · 2 travellers" },
      ],
      text: "Flights are the swing factor — moving by two days saves enough to cover four dinners. I've flagged the two lines worth cutting if you want to come in under budget.",
      card: {
        kind: "budget",
        title: "Budget · 2 travellers",
        rows: [
          { k: "Flights · HND ↔ KIX", v: "¥62,400" },
          { k: "Stay · 7 nights, Gion", v: "¥148,000" },
          { k: "Rail + airport transfer", v: "¥18,600" },
          { k: "Food & experiences", v: "¥46,000" },
        ],
        total: "¥275,000",
      },
      brief: { budget: "¥280,000" },
    };
  }

  if (/flight|plane|fly|airline/.test(q)) {
    return {
      lead: "Scanning fares now.",
      tools: [
        { label: "Searched flights", detail: "42 routes · 6 airlines" },
        { label: "Checked fare rules", detail: "Change fees · baggage" },
      ],
      text: "The 07:40 departure is €90 cheaper and gets you in before check-in opens, so there's no wasted afternoon. I've put a 24-hour hold on it.",
      card: {
        kind: "options",
        title: "Flight options",
        rows: [
          { name: "07:40 · direct · 1 stop bag", meta: "Arrives 14:10 · changeable", price: "¥62,400" },
          { name: "13:05 · direct", meta: "Arrives 19:35 · non-refundable", price: "¥71,900" },
        ],
      },
      brief: {},
    };
  }

  return {
    lead: "Got it — let me narrow that down.",
    tools: [{ label: "Read intent", detail: "dates · budget · pace" }],
    text: "Tell me the rough dates and how many of you are travelling, and I'll come back with a real itinerary rather than a list of links. I can hold flights for 24 hours while we iterate.",
    brief: {},
  };
}

/* ------------------------------------------------------------------ */
/* small pieces                                                        */
/* ------------------------------------------------------------------ */

function AgentMark({ size = 26 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[9px] bg-[#1c6cb4] shadow-[0_1px_2px_rgba(2,60,100,0.3)]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 12 12">
        <rect x="4" y="0" width="4" height="4" fill="#5cccfc" />
        <rect x="0" y="4" width="4" height="4" fill="#d9f99d" />
        <rect x="8" y="4" width="4" height="4" fill="#ffffff" />
        <rect x="4" y="8" width="4" height="4" fill="#5cccfc" />
      </svg>
    </span>
  );
}

function Dots() {
  return (
    <span className="inline-flex items-end gap-[3px] pt-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-[5px] w-[5px] rounded-full bg-[#262323]/45"
          style={{ animation: "soft-pulse 1.05s ease-in-out infinite", animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

function ToolRow({ tool, done }: { tool: Tool; done: boolean }) {
  return (
    <li className="flex items-center gap-2.5 rounded-[10px] border border-[#e3e3e0] bg-[#f5f5f2] px-3 py-2">
      {done ? (
        <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
          <rect x="0" y="0" width="12" height="12" rx="3" fill="#34a853" />
          <path d="M3 6.2 5 8.2 9 4" fill="none" stroke="#fff" strokeWidth="1.6" />
        </svg>
      ) : (
        <svg
          width="13"
          height="13"
          viewBox="0 0 12 12"
          aria-hidden="true"
          className="shrink-0 animate-spin"
          style={{ animationDuration: "0.9s" }}
        >
          <circle cx="6" cy="6" r="5" fill="none" stroke="#d3d8d1" strokeWidth="2" />
          <path d="M6 1a5 5 0 0 1 5 5" fill="none" stroke="#1c91ec" strokeWidth="2" />
        </svg>
      )}
      <span className="min-w-0 truncate text-[12.5px] font-medium text-[#262323]/85">
        {tool.label}
      </span>
      <span className="ml-auto shrink-0 font-mono text-[11px] text-[#262323]/45">
        {tool.detail}
      </span>
    </li>
  );
}

function MessageCard({ card, held, onHold }: { card: Card; held: string[]; onHold: (n: string) => void }) {
  if (card.kind === "budget") {
    return (
      <div className="mt-3 rounded-[12px] border border-[#dee2de] bg-white p-3.5">
        <p className="mb-2.5 font-mono text-[10.5px] tracking-[0.6px] text-[#262323]/45 uppercase">
          {card.title}
        </p>
        <dl className="space-y-1.5">
          {card.rows.map((r) => (
            <div key={r.k} className="flex items-baseline gap-3 text-[13px]">
              <dt className="text-[#262323]/75">{r.k}</dt>
              <span className="mb-[3px] flex-1 border-b border-dotted border-[#dee2de]" />
              <dd className="font-medium tabular-nums text-[#262323]">{r.v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-2.5 flex items-baseline gap-3 border-t border-[#e3e3e0] pt-2.5 text-[13px]">
          <span className="font-medium text-[#262323]">Estimated total</span>
          <span className="ml-auto font-medium tabular-nums text-[#1c6cb4]">{card.total}</span>
        </div>
      </div>
    );
  }

  if (card.kind === "options") {
    return (
      <div className="mt-3 rounded-[12px] border border-[#dee2de] bg-white p-3.5">
        <p className="mb-2.5 font-mono text-[10.5px] tracking-[0.6px] text-[#262323]/45 uppercase">
          {card.title}
        </p>
        <ul className="space-y-2">
          {card.rows.map((r) => {
            const isHeld = held.includes(r.name);
            return (
              <li key={r.name}>
                <button
                  type="button"
                  onClick={() => onHold(r.name)}
                  className={`flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors ${
                    isHeld
                      ? "border-[#1c6cb4]/45 bg-[#1c6cb4]/8"
                      : "border-[#e3e3e0] bg-[#f5f5f2] hover:border-[#1c6cb4]/35 hover:bg-white"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[#262323]">
                      {r.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-[#262323]/50">
                      {r.meta}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[12.5px] font-medium tabular-nums text-[#1c6cb4]">
                      {r.price}
                    </span>
                    <span className="block text-[10.5px] text-[#262323]/45">
                      {isHeld ? "Held · 24h" : "Hold this"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-[12px] border border-[#dee2de] bg-white p-3.5">
      <p className="mb-2.5 font-mono text-[10.5px] tracking-[0.6px] text-[#262323]/45 uppercase">
        {card.title}
      </p>
      <ol className="space-y-0">
        {card.rows.map((r, i) => (
          <li
            key={r.k}
            className="flex gap-3 py-[7px] [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[#eeefec]"
          >
            <span className="mt-[1px] w-[7px] shrink-0">
              <span
                className={`block h-[7px] w-[7px] rounded-[2px] ${
                  i === 0 ? "bg-[#1c91ec]" : "bg-[#c9cfc7]"
                }`}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-snug text-[#262323]">{r.v}</span>
              {r.note && (
                <span className="block text-[11.5px] text-[#262323]/50">{r.note}</span>
              )}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-[#262323]/45">{r.k}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* main component                                                      */
/* ------------------------------------------------------------------ */

export default function TripChat() {
  const [thread, setThread] = useState<Msg[]>(SEED);
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState("");
  const [brief, setBrief] = useState<Brief>(BRIEF);
  const [held, setHeld] = useState<string[]>([]);
  const idRef = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const uid = () => `m${++idRef.current}`;
  const busy = pending !== null;

  /* --- agent state machine -------------------------------------- */
  useEffect(() => {
    if (!pending) return;
    const p = pending;

    if (p.step === "thinking") {
      const t = setTimeout(() => setPending((v) => v && { ...v, step: "tools" }), 700);
      return () => clearTimeout(t);
    }

    if (p.step === "tools") {
      if (p.toolIndex >= p.reply.tools.length) {
        const t = setTimeout(() => setPending((v) => v && { ...v, step: "answer" }), 300);
        return () => clearTimeout(t);
      }
      const t = setTimeout(
        () => setPending((v) => v && { ...v, toolIndex: v.toolIndex + 1 }),
        640,
      );
      return () => clearTimeout(t);
    }

    if (p.step === "answer") {
      const iv = setInterval(() => {
        setPending((v) => {
          if (!v) return v;
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
        },
      ]);
      if (p.reply.brief) setBrief((b) => ({ ...b, ...p.reply.brief }));
      setPending(null);
    }, 320);
    return () => clearTimeout(t);
  }, [pending]);

  /* --- keep the newest message in view --------------------------- */
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, pending]);

  function send(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    setThread((prev) => [...prev, { id: uid(), role: "user", text: value }]);
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setPending({ reply: replyFor(value), step: "thinking", toolIndex: 0, shown: 0 });
  }

  function toggleHold(name: string) {
    setHeld((h) => (h.includes(name) ? h.filter((n) => n !== name) : [...h, name]));
  }

  const heldCost = held.length;

  return (
    <section id="chat" className="relative z-20 -mt-8 sm:-mt-14">
      <div className="rounded-t-[24px] bg-paper sm:rounded-t-[32px]">
        <div className="mx-auto w-full max-w-[1180px] px-5 pt-16 pb-20 sm:px-8 sm:pt-20 lg:px-12 lg:pt-24 lg:pb-28">
          {/* section heading */}
          <div className="mb-9 max-w-[620px] lg:mb-12">
            <p className="mb-3 font-mono text-[11px] tracking-[1.4px] text-[#1c6cb4] uppercase">
              Your trip agent
            </p>
            <h2 className="text-[32px] leading-[1.12] font-medium tracking-[-0.5px] text-ink sm:text-[40px] sm:leading-[1.15] sm:tracking-[-0.8px]">
              Chat it into a real trip
            </h2>
            <p className="mt-4 text-[16px] leading-[1.5] text-ink/62">
              Ask for anything — a month, a mood, a budget. The agent researches,
              books, and keeps the plan in sync while you talk.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_324px]">
            {/* ---------------- chat panel ---------------- */}
            <div className="flex min-h-[560px] flex-col overflow-hidden rounded-[20px] border border-line-card bg-raised shadow-[0_1px_2px_rgba(38,35,35,0.04),0_18px_44px_-28px_rgba(38,35,35,0.35)]">
              {/* header */}
              <div className="flex items-center gap-3 border-b border-line-card bg-white px-4 py-3.5 sm:px-5">
                <AgentMark />
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] leading-tight font-medium text-ink">
                    Trip agent
                  </p>
                  <p className="mt-[3px] flex items-center gap-1.5 text-[11.5px] text-ink/50">
                    <span className="h-[7px] w-[7px] rounded-full bg-success" />
                    Online · replies instantly
                  </p>
                </div>
                <span className="ml-auto hidden shrink-0 rounded-full border border-line-pill bg-paper px-3 py-1 font-mono text-[10.5px] tracking-[0.4px] text-ink/55 uppercase sm:block">
                  {brief.destination}
                </span>
              </div>

              {/* log */}
              <div
                ref={scroller}
                className="thin-scroll flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5"
                style={{ maxHeight: "min(62svh, 620px)" }}
              >
                {thread.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="flex justify-end">
                      <p className="animate-slide-in max-w-[86%] rounded-[16px] rounded-br-[6px] bg-[#1c6cb4] px-4 py-2.5 text-[14px] leading-[1.5] text-white">
                        {m.text}
                      </p>
                    </div>
                  ) : (
                    <div key={m.id} className="animate-slide-in flex gap-2.5">
                      <AgentMark size={24} />
                      <div className="min-w-0 max-w-[92%] rounded-[16px] rounded-tl-[6px] border border-line-card bg-white px-4 py-3">
                        {m.lead && (
                          <p className="text-[14px] leading-[1.45] font-medium text-ink">
                            {m.lead}
                          </p>
                        )}
                        {m.tools.length > 0 && (
                          <ul className="mt-2.5 space-y-1.5">
                            {m.tools.map((t) => (
                              <ToolRow key={t.label} tool={t} done />
                            ))}
                          </ul>
                        )}
                        {m.text && (
                          <p className="mt-2.5 text-[14px] leading-[1.55] text-ink/75">
                            {m.text}
                          </p>
                        )}
                        {m.card && (
                          <MessageCard card={m.card} held={held} onHold={toggleHold} />
                        )}
                      </div>
                    </div>
                  ),
                )}

                {/* in-flight reply */}
                {pending && (
                  <div className="animate-slide-in flex gap-2.5">
                    <AgentMark size={24} />
                    <div className="min-w-0 max-w-[92%] rounded-[16px] rounded-tl-[6px] border border-line-card bg-white px-4 py-3">
                      {pending.step === "thinking" && (
                        <p className="flex items-center gap-2 text-[14px] text-ink/55">
                          <Dots />
                          Planning your trip…
                        </p>
                      )}

                      {pending.step !== "thinking" && pending.reply.tools.length > 0 && (
                        <ul className="space-y-1.5">
                          {pending.reply.tools.map((t, i) => (
                            <ToolRow key={t.label} tool={t} done={i < pending.toolIndex} />
                          ))}
                        </ul>
                      )}

                      {pending.shown > 0 && (
                        <p className="mt-2.5 text-[14px] leading-[1.55] whitespace-pre-wrap text-ink/75">
                          {pending.reply.text.slice(0, pending.shown)}
                          {pending.step === "answer" && (
                            <span className="ml-[2px] inline-block h-[14px] w-[7px] translate-y-[2px] bg-[#1c6cb4]" />
                          )}
                        </p>
                      )}

                      {pending.step === "done" && pending.reply.card && (
                        <MessageCard card={pending.reply.card} held={held} onHold={toggleHold} />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* composer */}
              <div className="border-t border-line-card bg-white px-4 pt-3.5 pb-4 sm:px-5">
                {thread.length <= 4 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        disabled={busy}
                        className="rounded-full border border-line-pill bg-paper px-3 py-1.5 text-[12.5px] text-ink/70 transition-colors hover:border-[#1c6cb4]/40 hover:bg-white hover:text-ink disabled:opacity-45"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(draft);
                  }}
                  className="flex items-end gap-2 rounded-[16px] border border-line-card bg-paper px-3 py-2 transition-colors focus-within:border-[#1c91ec]/55"
                >
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      const el = e.target;
                      el.style.height = "auto";
                      el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send(draft);
                      }
                    }}
                    placeholder="Where to, and when?"
                    aria-label="Message your trip agent"
                    className="max-h-32 flex-1 resize-none bg-transparent px-1 py-1.5 text-[14.5px] leading-[1.45] text-ink outline-none placeholder:text-ink/38"
                  />
                  <button
                    type="submit"
                    disabled={busy || !draft.trim()}
                    aria-label="Send message"
                    className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1c6cb4] text-white transition-all hover:bg-[#17588f] disabled:cursor-not-allowed disabled:bg-[#c6cbd3]"
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M8 14V2M8 2 3 7M8 2l5 5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </form>
                <p className="mt-2 text-center text-[11px] text-ink/38">
                  Holds are free for 24 hours. Nothing is charged until you approve it.
                </p>
              </div>
            </div>

            {/* ---------------- trip brief ---------------- */}
            <aside className="flex flex-col gap-5">
              <div className="rounded-[20px] border border-line-card bg-raised p-5 shadow-[0_1px_2px_rgba(38,35,35,0.04)]">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-[10.5px] tracking-[1.2px] text-ink/45 uppercase">
                    Trip brief
                  </p>
                  <span className="ml-auto rounded-full bg-[#1c6cb4]/10 px-2 py-[3px] font-mono text-[10px] tracking-[0.4px] text-[#1c6cb4] uppercase">
                    Live
                  </span>
                </div>

                <p className="mt-3 text-[22px] leading-tight font-medium tracking-[-0.3px] text-ink">
                  {brief.destination}
                </p>

                <dl className="mt-4 space-y-0">
                  {[
                    ["Dates", brief.dates],
                    ["Length", brief.nights],
                    ["Travellers", brief.travellers],
                    ["Budget", brief.budget],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-baseline gap-3 border-[#eeefec] py-2.5 [&:not(:last-child)]:border-b"
                    >
                      <dt className="text-[13px] text-ink/55">{k}</dt>
                      <dd className="ml-auto text-[13px] font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-4 rounded-[12px] border border-line-pill bg-white p-3">
                  <p className="flex items-center gap-2 text-[12px] text-ink/60">
                    <span className="h-[7px] w-[7px] rounded-full bg-[#1c91ec]" />
                    {heldCost === 0 ? "Nothing held yet" : `${heldCost} item${heldCost > 1 ? "s" : ""} held for 24h`}
                  </p>
                  {held.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {held.map((h) => (
                        <li key={h} className="flex gap-2 text-[11.5px] leading-snug text-ink/70">
                          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" className="mt-[2px] shrink-0">
                            <rect width="12" height="12" rx="3" fill="#34a853" />
                            <path d="M3 6.2 5 8.2 9 4" fill="none" stroke="#fff" strokeWidth="1.6" />
                          </svg>
                          <span className="min-w-0">{h}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* what the agent can do */}
              <div className="rounded-[20px] border border-line-card bg-[#1c6cb4] p-5 text-white">
                <p className="font-mono text-[10.5px] tracking-[1.2px] text-white/60 uppercase">
                  Runs in the background
                </p>
                <ul className="mt-3.5 space-y-3">
                  {[
                    ["Fares", "Watches prices and re-books when they drop"],
                    ["Stays", "Holds rooms while you decide"],
                    ["Day plan", "Re-orders around weather and closures"],
                    ["Budget", "Keeps every booking inside your number"],
                  ].map(([k, v]) => (
                    <li key={k} className="flex gap-3">
                      <span className="mt-[6px] h-[7px] w-[7px] shrink-0 rounded-[2px] bg-[#5cccfc]" />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-medium">{k}</span>
                        <span className="block text-[12.5px] leading-snug text-white/65">{v}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
