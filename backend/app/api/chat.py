"""Chat endpoint: runs the memory-aware all-in-one trip-agent graph.

The frontend round-trips long/short-term memory (localStorage) with every turn,
so the agent keeps context across messages and sessions.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agents.graph import run_chat
from app.agents.state import MemoryPayload
from app.core.config import settings

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    session_id: str = Field(default="default", max_length=64)
    memory: MemoryPayload | None = None


class ChatResponse(BaseModel):
    reply_lead: str = ""
    reply_text: str = ""
    details: dict = Field(default_factory=dict)
    trip_plan: dict | None = None
    memory: MemoryPayload = Field(default_factory=MemoryPayload)
    needs_follow_up: bool = False
    follow_up_questions: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    tools: list[dict] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    result = await asyncio.to_thread(run_chat, req.message, req.memory, req.session_id)
    return ChatResponse(**result)


@router.get("/chat/config")
def chat_config() -> dict[str, bool | str]:
    """Show which providers are configured (booleans only — never values)."""
    return {
        "groq_configured": bool(settings.GROQ_API_KEY or settings.LLM_API_KEY),
        "groq_model": settings.LLM_MODEL or settings.GROQ_MODEL,
        "rapidapi_configured": bool(settings.RAPID_API_KEY),
        "otd_delhi_configured": bool(settings.OTD_DELHI_API),
        "yelp_configured": bool(settings.YELP_API_KEY),
        "amadeus_configured": bool(settings.AMADEUS_KEY and settings.AMADEUS_SECRET),
        "free_geodata": True,
    }
