from __future__ import annotations

from fastapi import APIRouter, Query

from app.db import get_session
from app.schemas import StudyPlanCalendarResponse, StudyPlanRecalculateResponse, StudyPlanTodayResponse
from app.services.study_plan_service import (
    add_focus_to_today_plan,
    get_study_plan_calendar,
    get_today_study_plan,
    recalculate_today_study_plan,
    remove_extra_focus_from_today_plan,
)


router = APIRouter(prefix="/api/study-plan")


@router.get("/today", response_model=StudyPlanTodayResponse)
def today_study_plan() -> StudyPlanTodayResponse:
    with get_session() as session:
        return get_today_study_plan(session)


@router.get("/calendar", response_model=StudyPlanCalendarResponse)
def study_plan_calendar(days: int = Query(default=7, ge=1, le=14)) -> StudyPlanCalendarResponse:
    with get_session() as session:
        return get_study_plan_calendar(session, days=days)


@router.post("/today/recalculate", response_model=StudyPlanRecalculateResponse)
def recalculate_today_plan() -> StudyPlanRecalculateResponse:
    with get_session() as session:
        return recalculate_today_study_plan(session)


@router.post("/today/add-focus", response_model=StudyPlanTodayResponse)
def add_today_focus() -> StudyPlanTodayResponse:
    with get_session() as session:
        return add_focus_to_today_plan(session)


@router.delete("/today/extra-focus/{subject_id}", response_model=StudyPlanTodayResponse)
def remove_today_extra_focus(subject_id: int) -> StudyPlanTodayResponse:
    with get_session() as session:
        return remove_extra_focus_from_today_plan(session, subject_id)
