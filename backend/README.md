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
