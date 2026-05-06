from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query

from app.db import get_session
from app.schemas import (
    StatsDisciplineItem,
    StatsDisciplineResponse,
    StatsDisciplineSubjectsResponse,
    StatsHeatmapResponse,
    StatsOverviewResponse,
    StatsTimeSeriesResponse,
)
from app.services.stats_service import (
    get_stats_discipline,
    get_stats_discipline_subjects,
    get_stats_disciplines,
    get_stats_heatmap,
    get_stats_overview,
    get_stats_timeseries,
)


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


@router.get("/heatmap", response_model=StatsHeatmapResponse)
def stats_heatmap(
    days: int = Query(default=365, ge=7, le=730),
    discipline: str | None = Query(default=None),
) -> StatsHeatmapResponse:
    with get_session() as session:
        return get_stats_heatmap(session, days=days, discipline=discipline)


@router.get("/timeseries", response_model=StatsTimeSeriesResponse)
def stats_timeseries(
    group_by: Literal["day", "week"] = Query(default="week"),
    days: int = Query(default=180, ge=7, le=730),
    discipline: str | None = Query(default=None),
) -> StatsTimeSeriesResponse:
    with get_session() as session:
        return get_stats_timeseries(session, group_by=group_by, days=days, discipline=discipline)


@router.get("/discipline/{discipline}/subjects", response_model=StatsDisciplineSubjectsResponse)
def stats_discipline_subjects(discipline: str) -> StatsDisciplineSubjectsResponse:
    with get_session() as session:
        return get_stats_discipline_subjects(session, discipline)
