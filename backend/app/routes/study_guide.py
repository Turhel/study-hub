from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter
from sqlmodel import select

from app.db import get_session
from app.models import Block, DailyStudyPlan, DailyStudyPlanItem, MockExam, Review, Subject, UserCalendarEvent
from app.schemas import (
    StudyGuideCalendarProjectionDay,
    StudyGuidePreferences,
    StudyGuidePreferencesResponse,
    UserCalendarEventCreate,
    UserCalendarEventResponse,
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


def _scheduled_review_labels(session, target_date: date) -> list[str]:
    reviews = session.exec(
        select(Review)
        .where(Review.proxima_data == target_date)
        .where(Review.status == "pendente")
    ).all()

    labels: list[str] = []
    for review in reviews:
        subject = session.get(Subject, review.subject_id) if review.subject_id else None
        block = session.get(Block, review.block_id) if review.block_id else None

        if subject is not None:
            subject_name = subject.assunto
            if subject.subassunto:
                subject_name = f"{subject_name} - {subject.subassunto}"
            discipline = subject.disciplina
        else:
            subject_name = "Revisao sem assunto vinculado"
            discipline = block.disciplina if block is not None else "Geral"

        block_name = f" / {block.nome}" if block is not None else ""
        labels.append(f"{discipline} - {subject_name}{block_name}")

    return labels


def _active_plan_for_day(session, target_date: date) -> DailyStudyPlan | None:
    return session.exec(
        select(DailyStudyPlan)
        .where(DailyStudyPlan.plan_date == target_date)
        .where(DailyStudyPlan.status == "active")
        .order_by(DailyStudyPlan.created_at.desc(), DailyStudyPlan.id.desc())
    ).first()


def _active_plan_items_for_day(session, target_date: date) -> list[DailyStudyPlanItem]:
    plan = _active_plan_for_day(session, target_date)
    if plan is None or plan.id is None:
        return []
    return list(
        session.exec(
            select(DailyStudyPlanItem)
            .where(DailyStudyPlanItem.plan_id == plan.id)
            .order_by(DailyStudyPlanItem.priority_score.desc(), DailyStudyPlanItem.id)
        ).all()
    )


def _active_plan_labels(session, target_date: date) -> list[str]:
    labels: list[str] = []
    for item in _active_plan_items_for_day(session, target_date):
        subject = session.get(Subject, item.subject_id)
        block = session.get(Block, item.block_id)
        subject_name = subject.assunto if subject is not None else f"Assunto {item.subject_id}"
        if subject is not None and subject.subassunto:
            subject_name = f"{subject_name} - {subject.subassunto}"
        block_name = block.nome if block is not None else f"Bloco {item.block_id}"
        labels.append(f"{item.discipline} - {subject_name} / {block_name} · {item.planned_questions} questoes")
    return labels


def _active_plan_questions(session, target_date: date) -> int:
    return sum(item.planned_questions for item in _active_plan_items_for_day(session, target_date))


def _mock_exams_for_day(session, target_date: date) -> list[MockExam]:
    return list(session.exec(select(MockExam).where(MockExam.data == target_date)).all())


def _parse_event_date(value: str) -> date:
    return date.fromisoformat(value)


def _calendar_event_response(event: UserCalendarEvent) -> UserCalendarEventResponse:
    return UserCalendarEventResponse(
        id=event.id or 0,
        event_type=event.event_type,
        start_date=event.start_date.isoformat(),
        end_date=event.end_date.isoformat(),
        description=event.description,
    )


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
            plan_questions = _active_plan_questions(session, target_date)
            scheduled_items = [
                *_active_plan_labels(session, target_date),
                *_scheduled_review_labels(session, target_date),
            ]
            mock_exams = _mock_exams_for_day(session, target_date)
            has_simulado = bool(mock_exams) or any(event.event_type == EVENT_MOCK_EXAM for event in events)

            estimated_questions = plan_questions + (revisoes_count * 5)
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
                    scheduled_items=scheduled_items,
                )
            )

    return projected_days


@router.post("/calendar-events", response_model=UserCalendarEventResponse)
def create_calendar_event(payload: UserCalendarEventCreate) -> UserCalendarEventResponse:
    start_date = _parse_event_date(payload.start_date)
    end_date = _parse_event_date(payload.end_date)
    if end_date < start_date:
        start_date, end_date = end_date, start_date

    with get_session() as session:
        event = UserCalendarEvent(
            event_type=payload.event_type,
            start_date=start_date,
            end_date=end_date,
            description=payload.description.strip() if payload.description else None,
        )
        session.add(event)
        session.commit()
        session.refresh(event)
        return _calendar_event_response(event)

