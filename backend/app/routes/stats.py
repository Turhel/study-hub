from __future__ import annotations

from fastapi import APIRouter

from app.db import get_session
from app.schemas import StatsDisciplineItem, StatsDisciplineResponse, StatsOverviewResponse
from app.services.stats_service import get_stats_discipline, get_stats_disciplines, get_stats_overview


router = APIRouter(prefix="/api/stats")


@router.get("/overview", response_model=StatsOverviewResponse)
def stats_overview() -> StatsOverviewResponse:
    with get_session() as session:
        return get_stats_overview(session)


@router.get("/disciplines", response_model=list[StatsDisciplineItem])
def stats_disciplines() -> list[StatsDisciplineItem]:
    with get_session() as session:
        return get_stats_disciplines(session)


@router.get("/discipline/{discipline}", response_model=StatsDisciplineResponse)
def stats_discipline_detail(discipline: str) -> StatsDisciplineResponse:
    with get_session() as session:
        return get_stats_discipline(session, discipline)
