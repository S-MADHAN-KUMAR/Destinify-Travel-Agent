"use client";

import type { Card, Tool } from "@/lib/trip-chat";

/* ------------------------------------------------------------------ */
/* Shared pieces of the trip-agent conversation UI                     */
/* ------------------------------------------------------------------ */

export function AgentMark({ size = 26 }: { size?: number }) {
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

export function Dots() {
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

export function ToolRow({ tool, done }: { tool: Tool; done: boolean }) {
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

/** Live search rows returned by the backend (`kind: "travel"`). */
const MODE_DOT: Record<string, string> = {
  train: "#1c91ec",
  flight: "#1c6cb4",
  bus: "#a76451",
  cab: "#34a853",
  transit: "#629959",
};

function TravelRows({ card }: { card: Extract<Card, { kind: "travel" }> }) {
  return (
    <div className="mt-3 rounded-[12px] border border-[#dee2de] bg-white p-3.5">
      <p className="mb-2.5 font-mono text-[10.5px] tracking-[0.6px] text-[#262323]/45 uppercase">
        {card.title}
      </p>
      <ul className="space-y-2">
        {card.rows.map((r, i) => (
          <li
            key={`${r.mode}-${i}`}
            className="flex items-center gap-3 rounded-[10px] border border-[#e3e3e0] bg-[#f5f5f2] px-3 py-2.5"
          >
            <span
              className="mt-[1px] h-[9px] w-[9px] shrink-0 rounded-[3px]"
              style={{ background: MODE_DOT[r.mode] ?? "#c9cfc7" }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-[#262323]">
                {r.title}
              </span>
              <span className="block truncate text-[11.5px] text-[#262323]/50">
                {[r.mode.toUpperCase(), r.meta].filter(Boolean).join(" · ")}
              </span>
              {r.note && (
                <span className="block truncate text-[11.5px] text-[#262323]/45">{r.note}</span>
              )}
            </span>
            <span className="shrink-0 text-right">
              <span
                className={`block text-[13px] font-medium tabular-nums ${
                  r.price === "—" ? "text-[#262323]/45" : "text-[#1c6cb4]"
                }`}
              >
                {r.price}
              </span>
              <span className="block text-[10.5px] text-[#262323]/45">
                {r.live ? "live" : "estimate"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Collapsed telemetry from the graph (notes + tool errors). */
export function AgentNotes({ notes }: { notes?: string[] }) {
  if (!notes || notes.length === 0) return null;
  return (
    <details className="mt-3 rounded-[10px] border border-[#e3e3e0] bg-[#f5f5f2]/70 px-3 py-2 open:pb-2">
      <summary className="cursor-pointer list-none text-[11.5px] font-medium text-[#262323]/50 select-none [&::-webkit-details-marker]:hidden">
        How I got this · {notes.length} note{notes.length > 1 ? "s" : ""}
      </summary>
      <ul className="mt-2 space-y-1 border-t border-[#e3e3e0] pt-2 text-[11.5px] leading-[1.5] text-[#262323]/55">
        {notes.map((n, i) => (
          <li key={i} className="whitespace-pre-wrap break-words">
            {n}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The structured payload the agent hands back (itinerary / options / budget). */
export function MessageCard({
  card,
  held,
  onHold,
}: {
  card: Card;
  held: string[];
  onHold: (n: string) => void;
}) {
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

  if (card.kind === "travel") {
    return <TravelRows card={card} />;
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
