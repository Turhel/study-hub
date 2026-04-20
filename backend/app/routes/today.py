from __future__ import annotations

from fastapi import APIRouter

from app.db import get_session
from app.schemas import TodayResponse
from app.services.today_service import get_today_summary


router = APIRouter(prefix="/api")


@router.get("/today", response_model=TodayResponse)
def today() -> TodayResponse:
    with get_session() as session:
        return get_today_summary(session)
