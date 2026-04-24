from __future__ import annotations

from fastapi import APIRouter

from app.db import get_session
from app.schemas import StudyPlanRecalculateResponse, StudyPlanTodayResponse
from app.services.study_plan_service import get_today_study_plan, recalculate_today_study_plan


router = APIRouter(prefix="/api/study-plan")


@router.get("/today", response_model=StudyPlanTodayResponse)
def today_study_plan() -> StudyPlanTodayResponse:
    with get_session() as session:
        return get_today_study_plan(session)


@router.post("/today/recalculate", response_model=StudyPlanRecalculateResponse)
def recalculate_today_plan() -> StudyPlanRecalculateResponse:
    with get_session() as session:
        return recalculate_today_study_plan(session)
