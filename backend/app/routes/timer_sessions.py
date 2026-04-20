from __future__ import annotations

from fastapi import APIRouter

from app.db import get_session
from app.schemas import TimerSessionCreate, TimerSessionCreateResponse, TimerSessionRecentItem
from app.services.timer_session_service import create_timer_session, recent_timer_sessions


router = APIRouter(prefix="/api/timer-sessions")


@router.post("", response_model=TimerSessionCreateResponse)
def create_session(payload: TimerSessionCreate) -> TimerSessionCreateResponse:
    with get_session() as session:
        saved = create_timer_session(session, payload)
        return TimerSessionCreateResponse(id=saved.id or 0)


@router.get("/recent", response_model=list[TimerSessionRecentItem])
def recent_sessions() -> list[TimerSessionRecentItem]:
    with get_session() as session:
        return recent_timer_sessions(session)
