from __future__ import annotations

from fastapi import APIRouter, Query

from app.db import get_session
from app.schemas import ActivityItem, ActivityTodayResponse
from app.services.activity_service import get_recent_activity, get_today_activity_summary


router = APIRouter(prefix="/api/activity")


@router.get("/recent", response_model=list[ActivityItem])
def recent_activity(limit: int = Query(default=30, ge=1, le=100)) -> list[ActivityItem]:
    with get_session() as session:
        return get_recent_activity(session, limit=limit)


@router.get("/today", response_model=ActivityTodayResponse)
def today_activity() -> ActivityTodayResponse:
    with get_session() as session:
        return get_today_activity_summary(session)
