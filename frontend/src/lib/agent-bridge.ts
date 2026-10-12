/**
 * Bridge: backend `ChatResponse` → the UI's `Reply` model.
 *
 * The API answers with typed travel details, mode options, notes and errors;
 * this turns that into a lead sentence, tool rows, a result card and a live
 * trip brief — so both chat surfaces render the real agent the same way.
 */

import type { ChatResponse, TravelDetails, TravelMode, TravelOption } from "@/lib/api";
import type { Brief, Card, Reply, Tool, TravelRow } from "@/lib/trip-chat";

const MODE_LABEL: Record<TravelMode, string> = {
  train: "Trains",
  flight: "Flights",
  bus: "Buses",
  cab: "Cabs",
  transit: "Delhi transit",
};

const isLive = (o: TravelOption) => o.source === "rapidapi" || o.source === "otd_delhi";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function durationLabel(min?: number | null): string | null {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function detailNumber(details: Record<string, unknown>, key: string, suffix: string) {
  const v = details[key];
  return typeof v === "number" && v > 0 ? `${v}${suffix}` : null;
}

function rowFor(o: TravelOption): TravelRow {
  const meta = [
    o.provider,
    durationLabel(o.duration_min),
    detailNumber(o.details, "distance_km", " km"),
    detailNumber(o.details, "vehicles_total", " vehicles"),
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    mode: o.mode,
    title: o.title,
    meta,
    price: o.price_inr == null ? "—" : inr(o.price_inr),
    live: isLive(o),
    note: o.note || undefined,
  };
}

function toolsFor(res: ChatResponse): Tool[] {
  return res.selected_modes.map((mode) => {
    const forMode = res.options.filter((o) => o.mode === mode);
    const live = forMode.some(isLive);
    const detail = forMode.length === 0 ? "no options" : live ? "live data" : "estimates";
    return { label: `Searched ${MODE_LABEL[mode].toLowerCase()}`, detail };
  });
}

function briefFor(res: ChatResponse): Partial<Brief> {
  const d = res.details;
  const brief: Partial<Brief> = {};
  if (d.origin || d.destination) {
    brief.destination = [d.origin, d.destination].filter(Boolean).join(" → ");
  }
  if (d.travel_date) {
    brief.dates = d.return_date ? `${d.travel_date} → ${d.return_date}` : d.travel_date;
  }
  if (d.passengers) {
    brief.travellers = `${d.passengers} traveller${d.passengers > 1 ? "s" : ""}`;
  }
  if (d.budget_inr) brief.budget = inr(d.budget_inr);
  return brief;
}

const plural = (n: number) => (n === 1 ? "" : "s");

/**
 * The API takes a single `message`, so the conversation's context has to ride
 * along: repeat what the classifier already extracted (origin, date, modes…)
 * and label the user's newest line as the latest message. Follow-ups like
 * "April 5" then resolve against the trip instead of arriving bare.
 */
export function composeMessage(text: string, prior: TravelDetails | null): string {
  if (!prior) return text;

  const bits: string[] = [];
  if (prior.origin && prior.destination) bits.push(`from ${prior.origin} to ${prior.destination}`);
  else if (prior.origin) bits.push(`starting from ${prior.origin}`);
  else if (prior.destination) bits.push(`heading to ${prior.destination}`);
  if (prior.travel_date) bits.push(`travel date ${prior.travel_date}`);
  if (prior.return_date) bits.push(`return ${prior.return_date}`);
  if (prior.passengers > 1) bits.push(`${prior.passengers} passengers`);
  if (prior.budget_inr) bits.push(`budget ${inr(prior.budget_inr)}`);
  if (prior.preferred_modes.length) bits.push(`by ${prior.preferred_modes.join("/")}`);

  if (bits.length === 0) return text;

  /* Latest message first, so the newest instruction wins over stale context */
  return `Latest message: ${text}. Trip context: ${bits.join(", ")}`;
}

export function mapChatResponse(res: ChatResponse): Reply {
  const tools = toolsFor(res);
  const brief = briefFor(res);
  const telemetry = [...res.notes, ...res.errors];

  /* 1. The agent needs more detail → surface the questions, no card. */
  if (res.needs_follow_up) {
    const questions = res.follow_up_questions;
    return {
      lead:
        questions.length === 1
          ? questions[0]
          : "I can search as soon as I know a couple of things:",
      tools,
      text: questions.length === 1 ? "" : questions.map((q) => `• ${q}`).join("\n"),
      brief,
      notes: telemetry,
    };
  }

  /* 2. Options came back → one card, priced options first (API sorts them). */
  const options = res.options;
  const modes = res.selected_modes;

  if (options.length === 0) {
    return {
      lead: "I couldn't pull any options for that one.",
      tools,
      text: res.errors.length
        ? "The live sources I'd normally use are unreachable right now — try again in a minute, or give me an origin and a destination to price instead."
        : "Give me an origin, a destination and a date, and I'll price the route across the modes you care about.",
      brief,
      notes: telemetry,
    };
  }

  const priced = options.filter((o) => o.price_inr != null).length;
  const modeNames = modes.map((m) => MODE_LABEL[m].toLowerCase()).join(", ");
  const liveCount = options.filter(isLive).length;

  const card: Card = {
    kind: "travel",
    title: `Options · ${options.length} found`,
    rows: options.map(rowFor),
  };

  const lines: string[] = [];
  if (priced) {
    lines.push(
      `${priced} of these are priced, cheapest first — the rest need a live quote.`,
    );
  }
  if (liveCount === 0) {
    lines.push("Everything below is an estimate: the live fare sources aren't answering.");
  } else if (liveCount < options.length) {
    lines.push(`${options.length - liveCount} row${plural(options.length - liveCount)} fall back to estimates.`);
  }

  return {
    lead: `Found ${options.length} option${plural(options.length)} across ${modeNames}.`,
    tools,
    text: lines.join(" "),
    card,
    brief,
    notes: telemetry,
  };
}
