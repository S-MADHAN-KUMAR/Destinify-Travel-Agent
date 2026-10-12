# Destinify Backend (FastAPI + uv)

## Setup

```powershell
cd backend
uv venv
uv sync
```

## Run

```powershell
uv run uvicorn app.main:app --reload
```

- API: http://localhost:8000
- Docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/v1/health

## Agent flow

```mermaid
flowchart LR
    START([START<br/>chat message]) --> classifier

    classifier{"Classifier<br/>Groq LLM → regex fallback"}

    classifier -->|details complete| supervisor
    classifier -->|"missing fields → follow-up"| END

    supervisor["Supervisor<br/>picks which modes to run"]

    subgraph modes["Mode subagents · guarded (skip if unselected)"]
        train["Train agent<br/>RapidAPI IRCTC host"]
        flight["Flight agent<br/>RapidAPI sky-scrapper"]
        bus["Bus agent<br/>RapidAPI bus host"]
        cab["Cab agent<br/>per-km fare estimate"]
        transit["Transit agent<br/>Delhi GTFS-RT (OTD)"]
    end

    supervisor --> train
    supervisor --> flight
    supervisor --> bus
    supervisor --> cab
    supervisor --> transit

    train --> aggregator
    flight --> aggregator
    bus --> aggregator
    cab --> aggregator
    transit --> aggregator

    aggregator["Aggregator<br/>merges options + notes"] --> END([END<br/>priced options → API])

    classDef entry fill:#0e4d3a,stroke:#7fd4ff,color:#eaf6ff
    classDef router fill:#4a3a12,stroke:#ffc861,color:#eaf6ff
    classDef core fill:#1b3f6b,stroke:#7fd4ff,color:#eaf6ff
    classDef agent fill:#123a66,stroke:#7fd4ff,color:#eaf6ff

    class START,END entry
    class classifier router
    class supervisor,aggregator core
    class train,flight,bus,cab,transit agent
```

Notes:

- `classifier` short-circuits to `END` when required travel details are missing
  (follow-up questions); otherwise it routes to `supervisor`.
- The supervisor fans out to the selected mode subagents in parallel, then every
  mode fans into `aggregator`.
- Mode nodes are **guarded**: an unselected mode returns an empty delta so it
  never pollutes state.
