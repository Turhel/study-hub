from __future__ import annotations

from fastapi import APIRouter

from app.db import get_session
from app.schemas import GamificationSummaryResponse
from app.services.gamification_service import get_gamification_summary


router = APIRouter(prefix="/api/gamification")


@router.get("/summary", response_model=GamificationSummaryResponse)
def gamification_summary() -> GamificationSummaryResponse:
    with get_session() as session:
        return get_gamification_summary(session)
