# Destinify Frontend (Next.js)

The user-facing half of Destinify: a landing page with an animated hero and an
embedded trip chat, plus a full-screen `/chat` conversation with the FastAPI
backend.

## Prerequisites

The chat talks to the backend over HTTP. Start it first (see `../backend/README.md`):

```powershell
cd backend
uv run uvicorn app.main:app --port 8000
```

If the backend is down the UI still works — it falls back to a scripted demo
agent and the status strip shows **Demo mode · backend offline**. With the
backend up, the strip shows **Live · connected to the trip API**.

## Run

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or `/chat` for the
full-screen agent).

### Environment

```bash
# frontend/.env.local (optional — this is the default)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Set `NEXT_PUBLIC_API_URL` when the backend isn't on `localhost:8000`. It is a
`NEXT_PUBLIC_` variable, so it is read at **build** time — bake it in when you
run `npm run build`.

## Routes

| Route   | What it is                                                        |
| ------- | ----------------------------------------------------------------- |
| `/`     | Landing page: hero (GIF background), features, embedded trip chat  |
| `/chat` | Full-screen conversation — navbar, chat, footer below the fold    |

## How the chat works

```
src/
  app/chat/page.tsx        route shell: Nav + ChatApp + Footer
  components/
    chat-app.tsx           full-screen surface for /chat
    trip-chat.tsx          embedded chat section on the landing page
    chat-ui.tsx            shared pieces: AgentMark, ToolRow, MessageCard,
                           TravelRows, AgentNotes
  lib/
    use-trip-agent.ts      conversation engine both surfaces share
    api.ts                 typed backend client (health / chatConfig / sendChat)
    agent-bridge.ts        composes the outbound message, maps the response
    trip-chat.ts           shared types, briefs, scripted offline fallback
```

- The backend is **stateless** (`POST /api/v1/chat` takes a single `message`),
  so `composeMessage()` labels the user's newest line as `Latest message:` and
  repeats what the classifier already extracted as `Trip context:`. Follow-ups
  like "make it 3 travellers" resolve against the trip instead of arriving bare.
- `mapChatResponse()` turns the response into the UI: follow-up questions, the
  priced options card, brief pills, and collapsed notes/errors under
  **How I got this**.

## Checks

```powershell
npx tsc --noEmit     # types
npx eslint src       # lint
npm run build        # production build
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
