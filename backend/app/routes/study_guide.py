from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter
from sqlmodel import Session, select

from app.db import get_session
from app.models import Block, BlockMastery, DailyStudyPlan, DailyStudyPlanItem, MockExam, Review, Subject, UserCalendarEvent
from app.schemas import (
    StudyGuideCalendarProjectionDay,
    StudyGuidePreferences,
    StudyGuidePreferencesResponse,
    StudyPlanCalendarDay,
    UserCalendarEventCreate,
    UserCalendarEventResponse,
    UserEnergySettingsResponse,
    UserEnergySettingsUpdate,
)
from app.services.study_plan_service import build_study_plan_calendar
from app.services.capacity_service import (
    calculate_dynamic_daily_target,
    energy_settings_response,
    get_or_create_capacity,
    get_or_create_user_energy_settings,
    preferences_response,
    update_study_guide_preferences,
    update_user_energy_settings,
)
from app.services.review_service import review_question_target_for_stage


router = APIRouter(prefix="/api/study-guide")


PROTECTION_EXAMS = "PROVAS_ACADEMICAS"
PROTECTION_TRAVEL = "VIAGEM_DESCANSO"
EVENT_MOCK_EXAM = "SIMULADO_PROG"
QUESTIONS_PER_REVIEW_SLOT = 5
_STUDY_TIMEZONE = ZoneInfo("America/Sao_Paulo")


def _study_reference_day() -> date:
    return datetime.now(_STUDY_TIMEZONE).date()


@dataclass(frozen=True)
class _ReviewQueueItem:
    review_id: int
    block_id: int | None
    subject_id: int | None
    proxima_data: date
    priority: int
    stage: str
    label: str
    questions_estimate: int


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


def _eaere_stage_priority(stage: str | None) -> int:
    normalized = (stage or "E1").upper()
    if normalized.startswith("EX") or normalized == "A1":
        return 3
    if normalized in {"E1", "E2"}:
        return 1
    if normalized.startswith("RR") or normalized in {"R1", "R2", "R3", "R4", "R5", "R6", "R7"}:
        return 2
    return 3


def _discipline_short_name(discipline: str) -> str:
    normalized = discipline.strip().lower()
    shortcuts = {
        "biologia": "Bio",
        "química": "Química",
        "quimica": "Química",
        "física": "Física",
        "fisica": "Física",
        "matemática": "Mat",
        "matematica": "Mat",
        "linguagens": "Ling",
        "humanas": "Hum",
        "redação": "Red",
        "redacao": "Red",
    }
    for key, short in shortcuts.items():
        if key in normalized:
            return short
    return discipline.split()[0] if discipline else "Geral"


def _subject_topic_label(subject: Subject | None) -> str:
    if subject is None:
        return "Assunto"
    if subject.subassunto:
        return f"{subject.assunto} - {subject.subassunto}"
    return subject.assunto


def _format_subject_predicted(discipline: str, subject: Subject | None, stage: str) -> str:
    return f"{_discipline_short_name(discipline)}: {_subject_topic_label(subject)} ({stage})"


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


def _plan_predicted_labels(session, target_date: date) -> list[str]:
    labels: list[str] = []
    for item in _active_plan_items_for_day(session, target_date):
        subject = session.get(Subject, item.subject_id)
        stage = item.planned_mode.upper() if item.planned_mode else "FOCO"
        labels.append(_format_subject_predicted(item.discipline, subject, stage))
    return labels


def _active_plan_questions(session, target_date: date) -> int:
    return sum(item.planned_questions for item in _active_plan_items_for_day(session, target_date))


def _mock_exams_for_day(session, target_date: date) -> list[MockExam]:
    return list(session.exec(select(MockExam).where(MockExam.data == target_date)).all())


def _block_mastery_by_id(session) -> dict[int, BlockMastery]:
    return {row.block_id: row for row in session.exec(select(BlockMastery)).all()}


def _build_review_queue(session) -> list[_ReviewQueueItem]:
    reviews = session.exec(
        select(Review)
        .where(Review.status == "pendente")
        .order_by(Review.proxima_data, Review.id)
    ).all()
    mastery_by_block = _block_mastery_by_id(session)
    queue: list[_ReviewQueueItem] = []

    for review in reviews:
        if review.id is None:
            continue
        subject = session.get(Subject, review.subject_id) if review.subject_id else None
        block = session.get(Block, review.block_id) if review.block_id else None
        mastery = mastery_by_block.get(review.block_id or 0)
        stage = (mastery.eaere_stage if mastery is not None else "RR").upper()
        discipline = subject.disciplina if subject is not None else (block.disciplina if block is not None else "Geral")
        queue.append(
            _ReviewQueueItem(
                review_id=review.id,
                block_id=review.block_id,
                subject_id=review.subject_id,
                proxima_data=review.proxima_data,
                priority=_eaere_stage_priority(stage),
                stage=stage,
                label=_format_subject_predicted(discipline, subject, stage),
                questions_estimate=review_question_target_for_stage(stage),
            )
        )

    return queue


def _max_review_slots_for_day(session, target_date: date) -> int:
    daily_target = calculate_dynamic_daily_target(session)
    events = _events_for_day(session, target_date)
    if _protection_status(events) == "provas_academicas":
        daily_target = min(daily_target, 5)
    return max(1, daily_target // QUESTIONS_PER_REVIEW_SLOT)


def _dedupe_review_queue(items: list[_ReviewQueueItem]) -> list[_ReviewQueueItem]:
    seen_ids: set[int] = set()
    unique_items: list[_ReviewQueueItem] = []
    for item in items:
        if item.review_id in seen_ids:
            continue
        seen_ids.add(item.review_id)
        unique_items.append(item)
    return unique_items


def _labels_from_study_calendar_day(session: Session, calendar_day: StudyPlanCalendarDay | None) -> list[str]:
    if calendar_day is None:
        return []
    mastery_by_block = _block_mastery_by_id(session)
    labels: list[str] = []
    for item in calendar_day.items:
        if item.type != "study_focus":
            continue
        subject = session.get(Subject, item.subject_id) if item.subject_id else None
        discipline = item.discipline or (subject.disciplina if subject is not None else "Geral")
        stage = "FOCO"
        if item.block_id is not None:
            mastery = mastery_by_block.get(item.block_id)
            if mastery is not None and mastery.eaere_stage:
                stage = mastery.eaere_stage.upper()
        if subject is not None:
            labels.append(_format_subject_predicted(discipline, subject, stage))
        else:
            name = item.subject_name or "Assunto"
            labels.append(f"{_discipline_short_name(discipline)}: {name} ({stage})")
    return labels


def _simulate_review_schedule(
    session: Session,
    pending_reviews: list[_ReviewQueueItem],
    *,
    reference_day: date,
    days: int = 7,
) -> dict[date, list[_ReviewQueueItem]]:
    """Simula fila diaria: reprimidos (vencidos) + revisoes com proxima_data no dia."""
    reprimidos = sorted(
        [item for item in pending_reviews if item.proxima_data < reference_day],
        key=lambda item: (item.proxima_data, item.priority, item.review_id),
    )
    scheduled_by_day: dict[date, list[_ReviewQueueItem]] = {}
    for item in pending_reviews:
        if item.proxima_data < reference_day:
            continue
        scheduled_by_day.setdefault(item.proxima_data, []).append(item)

    allocations: dict[date, list[_ReviewQueueItem]] = {}

    for offset in range(days):
        target_date = reference_day + timedelta(days=offset)
        newly_due = sorted(
            scheduled_by_day.get(target_date, []),
            key=lambda item: (item.priority, item.review_id),
        )
        reprimido_ids = {item.review_id for item in reprimidos}
        queue = _dedupe_review_queue([*reprimidos, *[item for item in newly_due if item.review_id not in reprimido_ids]])
        queue.sort(key=lambda item: (item.priority, item.proxima_data, item.review_id))

        max_slots = _max_review_slots_for_day(session, target_date)
        selected = queue[:max_slots]
        reprimidos = queue[max_slots:]
        allocations[target_date] = selected

    return allocations


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


def build_calendar_projection(session: Session, *, today: date | None = None) -> list[StudyGuideCalendarProjectionDay]:
    reference_day = today or _study_reference_day()
    projected_days: list[StudyGuideCalendarProjectionDay] = []
    pending_reviews = _build_review_queue(session)
    review_schedule = _simulate_review_schedule(session, pending_reviews, reference_day=reference_day)
    study_calendar = build_study_plan_calendar(session, start_day=reference_day, days=7)
    study_day_by_date = {day.date: day for day in study_calendar.days}

    for offset in range(7):
        target_date = reference_day + timedelta(days=offset)
        events = _events_for_day(session, target_date)
        status_protecao = _protection_status(events)
        mock_exams = _mock_exams_for_day(session, target_date)
        has_simulado = bool(mock_exams) or any(event.event_type == EVENT_MOCK_EXAM for event in events)

        if status_protecao == "viagem_descanso":
            projected_days.append(
                StudyGuideCalendarProjectionDay(
                    date=target_date.isoformat(),
                    has_simulado=has_simulado,
                    revisoes_count=0,
                    total_questoes_estimadas=0,
                    status_protecao=status_protecao,
                    scheduled_items=[],
                    subjects_predicted=[],
                    focus_subjects_predicted=[],
                )
            )
            continue

        selected_reviews = review_schedule.get(target_date, [])
        subjects_predicted = [item.label for item in selected_reviews]
        plan_subjects_predicted = _plan_predicted_labels(session, target_date) if offset == 0 else []
        calendar_day = study_day_by_date.get(target_date.isoformat())
        focus_subjects_predicted = _labels_from_study_calendar_day(session, calendar_day) if offset > 0 else []

        revisoes_count = len(selected_reviews)
        plan_questions = _active_plan_questions(session, target_date) if offset == 0 else 0
        focus_questions = calendar_day.total_questions if calendar_day is not None and offset > 0 else 0
        if status_protecao == "provas_academicas":
            focus_subjects_predicted = []
            focus_questions = 0
        estimated_questions = plan_questions + focus_questions + sum(item.questions_estimate for item in selected_reviews)
        estimated_questions += sum(exam.total_questoes for exam in mock_exams)

        if status_protecao == "provas_academicas":
            estimated_questions = min(estimated_questions, 5)

        scheduled_items = [
            *[f"Plano ativo: {label}" for label in plan_subjects_predicted],
            *[f"Foco previsto: {label}" for label in focus_subjects_predicted],
            *[f"Revisao: {item.label}" for item in selected_reviews],
        ]

        projected_days.append(
            StudyGuideCalendarProjectionDay(
                date=target_date.isoformat(),
                has_simulado=has_simulado,
                revisoes_count=revisoes_count,
                total_questoes_estimadas=estimated_questions,
                status_protecao=status_protecao,
                scheduled_items=scheduled_items,
                subjects_predicted=subjects_predicted,
                plan_subjects_predicted=plan_subjects_predicted,
                focus_subjects_predicted=focus_subjects_predicted,
            )
        )

    return projected_days


@router.get("/calendar-projection", response_model=list[StudyGuideCalendarProjectionDay])
def read_calendar_projection() -> list[StudyGuideCalendarProjectionDay]:
    with get_session() as session:
        return build_calendar_projection(session)


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
