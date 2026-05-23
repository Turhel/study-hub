from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter
from sqlmodel import select

from app.db import get_session
from app.models import MockExam, Review, UserCalendarEvent
from app.schemas import (
    StudyGuideCalendarProjectionDay,
    StudyGuidePreferences,
    StudyGuidePreferencesResponse,
    UserEnergySettingsResponse,
    UserEnergySettingsUpdate,
)
from app.services.capacity_service import (
    energy_settings_response,
    get_or_create_capacity,
    get_or_create_user_energy_settings,
    preferences_response,
    update_study_guide_preferences,
    update_user_energy_settings,
)


router = APIRouter(prefix="/api/study-guide")


PROTECTION_EXAMS = "PROVAS_ACADEMICAS"
PROTECTION_TRAVEL = "VIAGEM_DESCANSO"
EVENT_MOCK_EXAM = "SIMULADO_PROG"


def _events_for_day(session, target_date: date) -> list[UserCalendarEvent]:
    return list(
        session.exec(
            select(UserCalendarEvent)
            .where(UserCalendarEvent.start_date <= target_date)
            .where(UserCalendarEvent.end_date >= target_date)
        ).all()
    )


def _protection_status(events: list[UserCalendarEvent]) -> str:
    event_types = {event.event_type for event in events}
    if PROTECTION_TRAVEL in event_types:
        return "viagem_descanso"
    if PROTECTION_EXAMS in event_types:
        return "provas_academicas"
    return "normal"


def _scheduled_reviews_count(session, target_date: date) -> int:
    return len(
        session.exec(
            select(Review)
            .where(Review.proxima_data == target_date)
            .where(Review.status == "pendente")
        ).all()
    )


def _mock_exams_for_day(session, target_date: date) -> list[MockExam]:
    return list(session.exec(select(MockExam).where(MockExam.data == target_date)).all())


@router.get("/preferences", response_model=StudyGuidePreferencesResponse)
def read_study_guide_preferences() -> StudyGuidePreferencesResponse:
    with get_session() as session:
        capacity = get_or_create_capacity(session)
        return preferences_response(capacity)


@router.put("/preferences", response_model=StudyGuidePreferencesResponse)
def update_preferences(payload: StudyGuidePreferences) -> StudyGuidePreferencesResponse:
    with get_session() as session:
        return update_study_guide_preferences(session, payload)


@router.get("/energy-settings", response_model=UserEnergySettingsResponse)
def read_user_energy_settings() -> UserEnergySettingsResponse:
    with get_session() as session:
        settings = get_or_create_user_energy_settings(session)
        return energy_settings_response(settings)


@router.put("/energy-settings", response_model=UserEnergySettingsResponse)
def update_energy_settings(payload: UserEnergySettingsUpdate) -> UserEnergySettingsResponse:
    with get_session() as session:
        return update_user_energy_settings(session, payload)


@router.get("/calendar-projection", response_model=list[StudyGuideCalendarProjectionDay])
def read_calendar_projection() -> list[StudyGuideCalendarProjectionDay]:
    today = date.today()
    projected_days: list[StudyGuideCalendarProjectionDay] = []

    with get_session() as session:
        for offset in range(7):
            target_date = today + timedelta(days=offset)
            events = _events_for_day(session, target_date)
            status_protecao = _protection_status(events)
            revisoes_count = _scheduled_reviews_count(session, target_date)
            mock_exams = _mock_exams_for_day(session, target_date)
            has_simulado = bool(mock_exams) or any(event.event_type == EVENT_MOCK_EXAM for event in events)

            estimated_questions = revisoes_count * 5
            estimated_questions += sum(exam.total_questoes for exam in mock_exams)

            if status_protecao == "viagem_descanso":
                estimated_questions = 0
            elif status_protecao == "provas_academicas":
                estimated_questions = min(estimated_questions, 5)

            projected_days.append(
                StudyGuideCalendarProjectionDay(
                    date=target_date.isoformat(),
                    has_simulado=has_simulado,
                    revisoes_count=revisoes_count,
                    total_questoes_estimadas=estimated_questions,
                    status_protecao=status_protecao,
                )
            )

    return projected_days

