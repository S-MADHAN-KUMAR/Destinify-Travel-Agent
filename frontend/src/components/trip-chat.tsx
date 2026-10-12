"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AgentMark, AgentNotes, Dots, MessageCard, ToolRow } from "@/components/chat-ui";
import { SEED, SUGGESTIONS } from "@/lib/trip-chat";
import { useTripAgent } from "@/lib/use-trip-agent";

/* ------------------------------------------------------------------ */
/* main component                                                      */
/* ------------------------------------------------------------------ */

export default function TripChat() {
  const { thread, pending, brief, held, status, busy, send, toggleHold } = useTripAgent(SEED);
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* --- keep the newest message in view --------------------------- */
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, pending]);

  function say(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    void send(value);
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";
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
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <h2 className="text-[32px] leading-[1.12] font-medium tracking-[-0.5px] text-ink sm:text-[40px] sm:leading-[1.15] sm:tracking-[-0.8px]">
                Chat it into a real trip
              </h2>
              <Link
                href="/chat"
                className="group inline-flex items-center gap-1.5 rounded-full border border-line-pill bg-white px-3.5 py-1.5 text-[13.5px] font-medium text-ink/70 transition-colors hover:border-[#1c6cb4]/45 hover:text-ink"
              >
                Open full screen
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5"
                >
                  <path
                    d="M2 6h8M6.5 2.5 10 6l-3.5 3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </div>
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
                    <span
                      className={`h-[7px] w-[7px] rounded-full ${
                        status === "live"
                          ? "bg-success"
                          : status === "demo"
                            ? "bg-clay"
                            : "bg-[#c9cfc7]"
                      }`}
                    />
                    {status === "live"
                      ? "Online · connected to the trip API"
                      : status === "demo"
                        ? "Demo mode · backend offline"
                        : "Connecting to the agent…"}
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
                          <p className="mt-2.5 text-[14px] leading-[1.55] whitespace-pre-wrap text-ink/75">
                            {m.text}
                          </p>
                        )}
                        {m.card && (
                          <MessageCard card={m.card} held={held} onHold={toggleHold} />
                        )}
                        <AgentNotes notes={m.notes} />
                      </div>
                    </div>
                  ),
                )}

                {/* awaiting the backend */}
                {pending?.phase === "calling" && (
                  <div className="animate-slide-in flex gap-2.5">
                    <AgentMark size={24} />
                    <div className="min-w-0 max-w-[92%] rounded-[16px] rounded-tl-[6px] border border-line-card bg-white px-4 py-3">
                      <p className="flex items-center gap-2 text-[14px] text-ink/55">
                        <Dots />
                        Querying the trip agent…
                      </p>
                    </div>
                  </div>
                )}

                {/* in-flight reply */}
                {pending?.phase === "reply" && (
                  <div className="animate-slide-in flex gap-2.5">
                    <AgentMark size={24} />
                    <div className="min-w-0 max-w-[92%] rounded-[16px] rounded-tl-[6px] border border-line-card bg-white px-4 py-3">
                      {pending.step === "thinking" && (
                        <p className="flex items-center gap-2 text-[14px] text-ink/55">
                          <Dots />
                          Planning your trip…
                        </p>
                      )}

                      {pending.step !== "thinking" && (
                        <p className="text-[14px] leading-[1.45] font-medium text-ink">
                          {pending.reply.lead}
                        </p>
                      )}

                      {pending.step !== "thinking" && pending.reply.tools.length > 0 && (
                        <ul className="mt-2.5 space-y-1.5">
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
                      {pending.step === "done" && <AgentNotes notes={pending.reply.notes} />}
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
                        onClick={() => say(s)}
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
                    say(draft);
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
                        say(draft);
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
