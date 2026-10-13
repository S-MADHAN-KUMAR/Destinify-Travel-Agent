# Destinify Frontend (Next.js)

The user-facing half of Destinify: a landing page with an animated hero and an
embedded scripted product tour, plus the production trip planner at `/chat` —
a two-pane surface with the agent conversation on the left and a live trip
board (3D globe, city map, day-by-day plan, food, stays, transport, budget) on
the right.

## Prerequisites

The chat talks to the backend over HTTP. Start it first (see `../backend/README.md`):

```powershell
cd backend
uv run uvicorn app.main:app --port 8000
```

The landing page is fully scripted and works without the backend. On `/chat` the
status strip shows **Live · trip engine connected** when the API answers and
**Offline · start the backend to plan** when it doesn't — messages and memory are
kept locally either way.

## Run

```powershell
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) or go straight to
[/chat](http://localhost:3000/chat).

### Environment

```bash
# frontend/.env (optional — this is the default)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Set `NEXT_PUBLIC_API_URL` when the backend isn't on `localhost:8000`. It is a
`NEXT_PUBLIC_` variable, so it is read at **build** time — bake it in when you
run `pnpm build`.

## Routes

| Route   | What it is                                                             |
| ------- | ---------------------------------------------------------------------- |
| `/`     | Landing page: hero (GIF background), scripted trip-chat tour, features  |
| `/chat` | Production planner: conversation pane + trip board (globe/map/itinerary) |

## How the planner works

```
src/
  app/chat/page.tsx        route shell: Nav + ChatApp + Footer
  components/
    chat-app.tsx           two-pane planner surface for /chat
    trip-board.tsx         all-in-one trip view: tabs + budget + globe + map
    globe-3d.tsx           react-three-fiber globe with the route arc
    city-map.tsx           Leaflet map with day pins + fly-to
    smart-image.tsx        resilient <img> with graceful fallback
    trip-chat.tsx          embedded scripted chat on the landing page
    chat-ui.tsx            shared pieces: AgentMark, ToolRow, AgentNotes
  lib/
    use-trip-planner.ts    production conversation engine (memory-aware)
    use-trip-agent.ts      self-contained scripted engine for the landing tour
    api.ts                 typed backend client (health / chatConfig / sendChat)
    memory.ts              localStorage long/short-term memory + session id
    trip-types.ts          frontend contract mirroring the backend models
    trip-chat.ts           shared types, briefs, scripted offline fallback
```

- **Memory round-trip.** Every `POST /api/v1/chat` sends
  `{message, session_id, memory}`; the response returns the updated memory,
  which is written straight back to `localStorage`. The agent therefore keeps
  context across messages *and* reloads — long-term profile (home city,
  interests, past destinations) plus the rolling short-term thread.
- **One board, many asks.** A plan response replaces the trip board; a
  conversational answer (a question about the plan) leaves the board untouched,
  so follow-ups never wipe a plan you are still reading.
- **Free-first images.** Photos come from OpenStreetMap/Wikipedia/Openverse via
  `SmartImage`, which falls back to a styled placeholder if a host blocks a
  request — no `next/image` allowlist fragility.

## Checks

```powershell
npx tsc --noEmit     # types
npx eslint src       # lint
pnpm build           # production build
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
