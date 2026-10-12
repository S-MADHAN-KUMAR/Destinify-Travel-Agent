"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { FRESH_BRIEF, OPENING, PROMPTS, SUGGESTIONS } from "@/lib/trip-chat";
import type { Msg } from "@/lib/trip-chat";
import { useTripAgent } from "@/lib/use-trip-agent";
import { AgentMark, AgentNotes, Dots, MessageCard, ToolRow } from "@/components/chat-ui";

/**
 * Full-screen chat surface for `/chat`.
 *
 * The thread runs edge-to-edge inside the page (no floating card): the agent's
 * replies sit directly on the paper, and only the composer is anchored to the
 * bottom. Conversation state lives in `useTripAgent`, which talks to the
 * FastAPI backend and falls back to the scripted agent when it's offline.
 */

const STATUS = {
  checking: { dot: "bg-[#c9cfc7]", label: "Connecting to agent…" },
  live: { dot: "bg-[#4bb86e]", label: "Live · connected to the trip API" },
  demo: { dot: "bg-[#e0a13f]", label: "Demo mode · backend offline" },
} as const;

/* icons — hand-drawn to match the pixel-grid mark, no icon dependency */
function IconArrowUp({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 14V2M8 2 3 7M8 2l5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconReturn({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M14 4v4a3 3 0 0 1-3 3H3m0 0 3.5-3.5M3 11l3.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPlus({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 3v10M3 8h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChatApp() {
  const { thread, pending, brief, held, status, busy, send, reset, toggleHold } = useTripAgent(
    OPENING,
    { brief: FRESH_BRIEF },
  );

  const [draft, setDraft] = useState("");
  const [stuck, setStuck] = useState(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /* the welcome panel opens at the top; after that, follow the newest line */
  const welcome = thread.length === 1 && pending === null;

  useEffect(() => {
    if (welcome) return;
    const el = scrollerRef.current;
    if (!el) return;
    if (stuck) el.scrollTop = el.scrollHeight;
    else setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread, pending, welcome]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  function jumpToLatest() {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setStuck(true);
  }

  function say(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    void send(value);
    setDraft("");
    setStuck(true);
    if (inputRef.current) inputRef.current.style.height = "auto";
  }

  function onInput() {
    const el = inputRef.current;
    if (!el) return;
    setDraft(el.value);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      say(draft);
      return;
    }
    /* "/" focuses the composer, but not while you're already typing */
    if (e.key === "/" && document.activeElement !== inputRef.current) {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }

  function newTrip() {
    reset();
    setDraft("");
    setStuck(true);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.focus();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* status strip — same bar treatment as the nav, plus live agent state */}
      <div className="z-40 border-b border-[#dee2de] bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-5 py-2.5">
          <p className="flex items-center gap-2 text-[12.5px] text-ink/60">
            <span className={`h-[7px] w-[7px] rounded-full ${STATUS[status].dot}`} aria-hidden="true" />
            {STATUS[status].label}
          </p>
          <p className="hidden font-mono text-[10.5px] tracking-[0.6px] text-ink/40 uppercase sm:block">
            Trip agent · v1
          </p>
        </div>
      </div>

      <main className="relative flex min-h-0 flex-1 flex-col">
        {/* brief pills — live values echoed back by the classifier */}
        <div className="mx-auto w-full max-w-4xl px-5 pt-5">
          <div className="flex flex-wrap gap-2">
            {[brief.destination, brief.dates, brief.travellers, brief.budget].map((pill) => (
              <span
                key={pill}
                className="rounded-[6px] border border-[#dee2de] bg-white px-2.5 py-1 text-[12.5px] text-ink/70"
              >
                {pill}
              </span>
            ))}
          </div>
        </div>

        {/* the conversation, straight on the page */}
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="thin-scroll mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto overscroll-contain px-5"
        >
          {/* welcome panel: first run only */}
          {thread.length === 1 && pending === null && (
            <section className="pt-10 pb-6">
              <p className="font-mono text-[10.5px] tracking-[0.6px] text-ink/40 uppercase">
                Ready when you are
              </p>
              <h2 className="mt-3 text-[clamp(28px,5vw,44px)] leading-[1.03] font-medium tracking-[-0.03em] text-ink">
                Where to next?
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink/60">
                Tell me a place, a rough window, and who&apos;s coming. I&apos;ll ask if
                anything&apos;s missing, then price trains, flights, buses and cabs live.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => say(s)}
                    className="rounded-full border border-[#dee2de] bg-white px-3.5 py-2 text-[13px] text-ink/70 transition hover:border-ink hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="space-y-6 py-6">
            {thread.map((m) => {
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[75%] rounded-[16px] rounded-br-[6px] bg-brand-deep px-4 py-2.5 text-[15px] leading-relaxed text-white whitespace-pre-wrap">
                      {m.text}
                    </p>
                  </div>
                );
              }
              const a = m as Extract<Msg, { role: "agent" }>;
              return (
                <div key={m.id} className="flex gap-3">
                  <AgentMark size={28} />
                  <div className="min-w-0 max-w-[min(640px,92%)]">
                    <p className="text-[15.5px] leading-snug font-medium text-ink">{a.lead}</p>
                        {a.tools.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {a.tools.map((t, i) => (
                              <ToolRow key={`${t.label}-${i}`} tool={t} done />
                            ))}
                          </div>
                        )}
                        {a.text && (
                          <p className="mt-2.5 text-[15px] leading-[1.65] text-ink/75 whitespace-pre-wrap">
                            {a.text}
                          </p>
                        )}
                        {a.card && <MessageCard card={a.card} held={held} onHold={toggleHold} />}
                    <AgentNotes notes={a.notes} />
                  </div>
                </div>
              );
            })}

            {/* awaiting the backend */}
            {pending?.phase === "calling" && (
              <div className="flex gap-3">
                <AgentMark size={28} />
                <p className="flex items-center gap-2 text-[15px] text-ink/55">
                  <Dots /> Querying the trip agent…
                </p>
              </div>
            )}

            {/* staged reveal of the agent's reply */}
            {pending?.phase === "reply" && (
              <div className="flex gap-3">
                <AgentMark size={28} />
                <div className="min-w-0 max-w-[min(640px,92%)]">
                  {pending.step === "thinking" && (
                    <p className="flex items-center gap-2 text-[15px] text-ink/55">
                      <Dots /> Reading your message…
                    </p>
                  )}
                  {pending.step !== "thinking" && (
                    <p className="text-[15.5px] leading-snug font-medium text-ink">
                      {pending.reply.lead}
                    </p>
                  )}
                  {pending.step !== "thinking" && pending.reply.tools.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {pending.reply.tools.map((t, i) => (
                        <ToolRow
                          key={`${t.label}-${i}`}
                          tool={t}
                          done={i < pending.toolIndex}
                        />
                      ))}
                    </div>
                  )}
                  {pending.step === "answer" && (
                    <p className="mt-2.5 text-[15px] leading-[1.65] text-ink/75 whitespace-pre-wrap">
                      {pending.reply.text.slice(0, pending.shown)}
                    </p>
                  )}
                  {pending.step === "done" && (
                    <>
                      {pending.reply.text && (
                        <p className="mt-2.5 text-[15px] leading-[1.65] text-ink/75 whitespace-pre-wrap">
                          {pending.reply.text}
                        </p>
                      )}
                      {pending.reply.card && (
                        <MessageCard card={pending.reply.card} held={held} onHold={toggleHold} />
                      )}
                      <AgentNotes notes={pending.reply.notes} />
                    </>
                  )}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* jump control, only when the reader has scrolled up */}
        {!stuck && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[112px] z-30 flex justify-center">
            <button
              type="button"
              onClick={jumpToLatest}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#dee2de] bg-white px-3.5 py-2 text-[12.5px] text-ink shadow-[0_4px_16px_rgba(38,35,35,0.12)] transition hover:bg-[#f5f5f2]"
            >
              Jump to latest <IconArrowUp size={14} />
            </button>
          </div>
        )}

        {/* composer */}
        <div className="sticky bottom-0 z-30 border-t border-[#dee2de] bg-paper/95 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-4xl px-5 py-3.5">
            {thread.length > 1 && thread.length <= 3 && (
              <div className="mb-2.5 flex flex-wrap gap-2">
                {PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={busy}
                    onClick={() => say(p)}
                    className="rounded-full border border-[#dee2de] bg-white px-3 py-1.5 text-[12.5px] text-ink/65 transition hover:border-ink hover:text-ink disabled:opacity-40"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-[14px] border border-[#dee2de] bg-white p-2 pl-3.5 focus-within:border-ink">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={onInput}
                onKeyDown={onKey}
                rows={1}
                disabled={busy}
                aria-label="Message the trip agent"
                placeholder={busy ? "The agent is working…" : "Ask the trip agent…"}
                className="block max-h-[180px] w-full resize-none border-0 bg-transparent py-2 text-[15px] leading-relaxed text-ink placeholder:text-ink/40 focus:ring-0 focus:outline-none"
              />
              <div className="flex items-center justify-between gap-3 pt-1.5">
                <p className="hidden items-center gap-3 text-[11.5px] text-ink/45 sm:flex">
                  <span className="flex items-center gap-1">
                    <IconReturn /> to send
                  </span>
                  <span>Shift + Enter for a new line</span>
                </p>
                <button
                  type="button"
                  onClick={() => say(draft)}
                  disabled={!draft.trim() || busy}
                  aria-label="Send message"
                  className="ml-auto flex h-8 w-8 items-center justify-center rounded-[8px] bg-ink text-white transition hover:bg-brand-deep disabled:opacity-30"
                >
                  <IconArrowUp />
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <p className="font-mono text-[10.5px] tracking-[0.5px] text-ink/35 uppercase">
                Press / to focus · demo agent · no real bookings
              </p>
              {thread.length > 1 && (
                <button
                  type="button"
                  onClick={newTrip}
                  className="flex items-center gap-1.5 rounded-[7px] border border-[#dee2de] bg-white px-2.5 py-1.5 text-[12.5px] text-ink/70 transition hover:border-ink hover:text-ink"
                >
                  <IconPlus /> New trip
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default ChatApp;
