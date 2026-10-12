from fastapi import APIRouter

from app.api.chat import router as chat_router

router = APIRouter()


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


router.include_router(chat_router)
