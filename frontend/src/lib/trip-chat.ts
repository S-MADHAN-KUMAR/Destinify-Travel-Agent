/* ------------------------------------------------------------------ */
/* Shared trip-agent chat engine                                       */
/*                                                                     */
/* Used by the landing-page section (@/components/trip-chat) and the    */
/* full-screen chat page (@/components/chat-app).                       */
/* ------------------------------------------------------------------ */

export type Tool = { label: string; detail: string };

/** One row of a live search result (from POST /api/v1/chat). */
export type TravelRow = {
  mode: string;
  title: string;
  meta: string;
  price: string;
  live: boolean;
  note?: string;
};

export type Card =
  | { kind: "itinerary"; title: string; rows: { k: string; v: string; note?: string }[] }
  | { kind: "options"; title: string; rows: { name: string; meta: string; price: string }[] }
  | { kind: "travel"; title: string; rows: TravelRow[] }
  | { kind: "budget"; title: string; rows: { k: string; v: string }[]; total: string };

export type Brief = {
  destination: string;
  dates: string;
  nights: string;
  travellers: string;
  budget: string;
};

export type Reply = {
  lead: string;
  tools: Tool[];
  text: string;
  card?: Card;
  brief?: Partial<Brief>;
  /** Raw agent telemetry (notes + tool errors), shown collapsed. */
  notes?: string[];
};

export type Msg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "agent"; lead: string; tools: Tool[]; text: string; card?: Card; notes?: string[] };

export type Pending =
  | { phase: "calling" }
  | {
      phase: "reply";
      reply: Reply;
      step: "thinking" | "tools" | "answer" | "done";
      toolIndex: number;
      shown: number;
    };

/* ------------------------------------------------------------------ */
/* seed conversation                                                   */
/* ------------------------------------------------------------------ */

export const BRIEF: Brief = {
  destination: "Kyoto, Japan",
  dates: "Apr 2 – Apr 9",
  nights: "7 nights",
  travellers: "2 adults",
  budget: "¥280,000",
};

/** Blank-slate brief for a fresh conversation (the full-screen `/chat` route). */
export const FRESH_BRIEF: Brief = {
  destination: "New trip",
  dates: "Dates flexible",
  nights: "Open",
  travellers: "1 traveller",
  budget: "No budget set",
};

export const SEED: Msg[] = [
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

/** A short, fresh thread — used by the "New trip" button. */
export const OPENING: Msg[] = [SEED[0]];

/** Tappable starters on the welcome panel — phrased so the backend
 *  classifier can extract origin/destination/date/passengers. */
export const SUGGESTIONS = [
  "From Delhi to Jaipur on 2026-04-05, 2 passengers",
  "From Mumbai to Goa by train",
  "From Bengaluru to Kolkata by flight on 2026-05-12",
  "How much is a cab from Saket to the airport?",
];

/** Chips above the composer while the thread is short. */
export const PROMPTS = [
  "From Hyderabad to Chennai on 2026-06-01",
  "Bus from Jaipur to Udaipur, 3 passengers",
  "Price check: train from Delhi to Lucknow",
  "I want to travel next weekend", // ← deliberately incomplete: shows the follow-up flow
];

/* ------------------------------------------------------------------ */
/* scripted agent                                                      */
/* ------------------------------------------------------------------ */

export function replyFor(input: string): Reply {
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

  if (/budget|price|cost|cheap|expensive|under|\$/.test(q)) {
    return {
      lead: "Here's where the money actually goes.",
      tools: [{ label: "Priced itinerary", detail: "Live rates · 2 travellers" }],
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

  if (/re-?plan|change|edit|swap|move/.test(q)) {
    return {
      lead: "Say the word and I'll re-book the chain.",
      tools: [
        { label: "Checked change fees", detail: "3 bookings · 1 fee" },
        { label: "Re-priced trip", detail: "Live rates · 2 travellers" },
      ],
      text: "Day 3 and 4 can swap without any penalty — the ryokan night is flexible until 48h out. I'll move the garden morning to day 4 and keep the market crawl on the same evening.",
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
