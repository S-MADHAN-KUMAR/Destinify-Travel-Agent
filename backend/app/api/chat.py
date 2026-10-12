"""Chat endpoint: runs the classifier -> supervisor -> subagents graph."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agents.graph import run_chat
from app.core.config import settings

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    details: dict = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)
    needs_follow_up: bool = False
    selected_modes: list[str] = Field(default_factory=list)
    options: list[dict] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    result = await asyncio.to_thread(run_chat, req.message)
    return ChatResponse(**result)


@router.get("/chat/config")
def chat_config() -> dict[str, bool | str]:
    """Show which realtime keys are configured (booleans only — never values)."""
    return {
        "groq_configured": bool(settings.GROQ_API_KEY),
        "groq_model": settings.GROQ_MODEL,
        "rapidapi_configured": bool(settings.RAPID_API_KEY),
        "otd_delhi_configured": bool(settings.OTD_DELHI_API),
    }
