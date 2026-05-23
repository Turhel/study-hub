from __future__ import annotations

import json
from datetime import date, datetime, timedelta

from sqlmodel import Session, select

from app.models import BlockMastery, MockExam, QuestionAttempt, StudyCapacity, StudyEvent, UserCalendarEvent, UserEnergySettings
from app.schemas import StudyGuidePreferences, StudyGuidePreferencesResponse, UserEnergySettingsResponse, UserEnergySettingsUpdate
from app.services.study_event_service import record_study_event


VALID_INTENSITIES = {"leve", "normal", "forte"}
LEGACY_DURATION_FIELD = "daily" "_minutes"


def get_or_create_capacity(session: Session) -> StudyCapacity:
    capacity = session.exec(select(StudyCapacity).order_by(StudyCapacity.id)).first()
    if capacity is not None:
        return capacity

    capacity = StudyCapacity(updated_at=datetime.utcnow())
    session.add(capacity)
    session.commit()
    session.refresh(capacity)
    return capacity


def get_or_create_user_energy_settings(session: Session, user_id: int = 1) -> UserEnergySettings:
    settings = session.exec(
        select(UserEnergySettings)
        .where(UserEnergySettings.user_id == user_id)
        .order_by(UserEnergySettings.id)
    ).first()
    if settings is not None:
        return settings

    settings = UserEnergySettings(user_id=user_id)
    session.add(settings)
    session.commit()
    session.refresh(settings)
    return settings


def energy_settings_response(settings: UserEnergySettings) -> UserEnergySettingsResponse:
    return UserEnergySettingsResponse(
        mode_dia_leve=settings.mode_dia_leve,
        mode_provas_academicas=settings.mode_provas_academicas,
        provas_activated_at=settings.provas_activated_at.isoformat() if settings.provas_activated_at else None,
        current_daily_target_questions=settings.current_daily_target_questions,
    )


def update_user_energy_settings(
    session: Session,
    payload: UserEnergySettingsUpdate,
    user_id: int = 1,
) -> UserEnergySettingsResponse:
    settings = get_or_create_user_energy_settings(session, user_id=user_id)
    previous_provas_mode = settings.mode_provas_academicas

    if payload.mode_dia_leve is not None:
        settings.mode_dia_leve = payload.mode_dia_leve
    if payload.mode_provas_academicas is not None:
        settings.mode_provas_academicas = payload.mode_provas_academicas
        if payload.mode_provas_academicas and (not previous_provas_mode or settings.provas_activated_at is None):
            settings.provas_activated_at = datetime.utcnow()
        if not payload.mode_provas_academicas:
            settings.provas_activated_at = None
    if payload.current_daily_target_questions is not None:
        settings.current_daily_target_questions = payload.current_daily_target_questions

    session.add(settings)
    record_study_event(
        session,
        event_type="energy_settings_update",
        title="Controle de energia atualizado",
        description="Modo de protecao cognitiva ajustado nas configuracoes.",
        metadata={
            "mode_dia_leve": settings.mode_dia_leve,
            "mode_provas_academicas": settings.mode_provas_academicas,
            "current_daily_target_questions": settings.current_daily_target_questions,
        },
    )
    session.commit()
    session.refresh(settings)
    return energy_settings_response(settings)


def _normalize_intensity(value: str | None) -> str:
    normalized = (value or "normal").strip().lower()
    if normalized not in VALID_INTENSITIES:
        return "normal"
    return normalized


def preferences_response(capacity: StudyCapacity) -> StudyGuidePreferencesResponse:
    return StudyGuidePreferencesResponse(
        **{LEGACY_DURATION_FIELD: getattr(capacity, LEGACY_DURATION_FIELD, 90)},
        intensity=_normalize_intensity(capacity.intensity),
        max_focus_count=capacity.max_focus_count,
        max_questions=capacity.max_questions,
        include_reviews=capacity.include_reviews,
        include_new_content=capacity.include_new_content,
        updated_at=capacity.updated_at.isoformat(),
    )


def update_study_guide_preferences(
    session: Session,
    payload: StudyGuidePreferences,
) -> StudyGuidePreferencesResponse:
    capacity = get_or_create_capacity(session)
    setattr(capacity, LEGACY_DURATION_FIELD, getattr(payload, LEGACY_DURATION_FIELD))
    capacity.intensity = _normalize_intensity(payload.intensity)
    capacity.max_focus_count = payload.max_focus_count
    capacity.max_questions = payload.max_questions
    capacity.include_reviews = payload.include_reviews
    capacity.include_new_content = payload.include_new_content
    capacity.updated_at = datetime.utcnow()
    session.add(capacity)
    session.flush()
    energy_settings = get_or_create_user_energy_settings(session)
    energy_settings.current_daily_target_questions = safe_daily_question_load(capacity)
    session.add(energy_settings)
    session.commit()
    session.refresh(capacity)
    return preferences_response(capacity)


def has_active_calendar_event(session: Session, event_type: str, target_date: date | None = None) -> bool:
    checked_date = target_date or date.today()
    return session.exec(
        select(UserCalendarEvent)
        .where(UserCalendarEvent.event_type == event_type)
        .where(UserCalendarEvent.start_date <= checked_date)
        .where(UserCalendarEvent.end_date >= checked_date)
        .limit(1)
    ).first() is not None


def is_academic_exam_protection_active(session: Session, settings: UserEnergySettings, target_date: date | None = None) -> bool:
    return settings.mode_provas_academicas or has_active_calendar_event(
        session,
        "PROVAS_ACADEMICAS",
        target_date=target_date,
    )


def calculate_dynamic_daily_target(session: Session, user_id: int = 1) -> int:
    settings = get_or_create_user_energy_settings(session, user_id=user_id)
    target = max(settings.current_daily_target_questions, 1)
    academic_exam_protection = is_academic_exam_protection_active(session, settings)

    if settings.mode_dia_leve:
        return 7

    now = datetime.utcnow()
    recent_mock_exam = session.exec(
        select(MockExam)
        .where(MockExam.finished_at.is_not(None))
        .where(MockExam.finished_at >= now - timedelta(hours=48))
        .order_by(MockExam.finished_at.desc())
    ).first()
    if recent_mock_exam is not None and recent_mock_exam.finished_at is not None:
        hours_since_exam = (now - recent_mock_exam.finished_at).total_seconds() / 3600
        if hours_since_exam <= 24:
            target = round(target * 0.40)
        else:
            target = round(target * 0.70)

    if academic_exam_protection:
        target = min(target, 5)

    return max(int(target), 1)


def _attempt_accuracy(attempts: list[QuestionAttempt]) -> float | None:
    if not attempts:
        return None
    return sum(1 for attempt in attempts if attempt.acertou) / len(attempts)


def _dia_leve_uses_last_14_days(session: Session, settings: UserEnergySettings) -> int:
    since = datetime.utcnow() - timedelta(days=14)
    events = session.exec(
        select(StudyEvent)
        .where(StudyEvent.created_at >= since)
        .where(StudyEvent.event_type.in_(["energy_settings_update", "study_capacity_update"]))
        .order_by(StudyEvent.created_at.desc())
    ).all()

    uses = 0
    for event in events:
        try:
            metadata = json.loads(event.metadata_json or "{}")
        except json.JSONDecodeError:
            metadata = {}
        if metadata.get("mode_dia_leve") is True:
            uses += 1
    if settings.mode_dia_leve:
        uses = max(uses, 1)
    return uses


def update_weekly_progression_target(session: Session, user_id: int = 1) -> UserEnergySettings:
    settings = get_or_create_user_energy_settings(session, user_id=user_id)
    today = date.today()
    since = today - timedelta(days=14)
    attempts = session.exec(select(QuestionAttempt).where(QuestionAttempt.data >= since)).all()
    global_accuracy = _attempt_accuracy(attempts)

    ex_block_ids = [
        row.block_id
        for row in session.exec(
            select(BlockMastery).where(BlockMastery.eaere_stage.startswith("EX"))
        ).all()
    ]
    ex_attempts: list[QuestionAttempt] = []
    if ex_block_ids:
        ex_attempts = session.exec(
            select(QuestionAttempt)
            .where(QuestionAttempt.data >= since)
            .where(QuestionAttempt.block_id.in_(ex_block_ids))
        ).all()
    ex_accuracy = _attempt_accuracy(ex_attempts)
    dia_leve_uses = _dia_leve_uses_last_14_days(session, settings)

    target = settings.current_daily_target_questions
    if global_accuracy is not None and global_accuracy >= 0.85 and dia_leve_uses == 0:
        target = min(45, target + 5)
    if dia_leve_uses > 3 or (ex_accuracy is not None and ex_accuracy < 0.75):
        target = max(15, target - 5)

    settings.current_daily_target_questions = target
    session.add(settings)
    session.commit()
    session.refresh(settings)
    return settings


def safe_daily_question_load(capacity: StudyCapacity) -> int:
    intensity = _normalize_intensity(capacity.intensity)
    review_reserve = 0.82 if capacity.include_reviews else 1.0
    base_load_by_intensity = {
        "leve": 15,
        "normal": 20,
        "forte": 30,
    }
    adjusted_load = int(base_load_by_intensity[intensity] * review_reserve)

    lower_bound = 8 if intensity == "leve" else 12
    conservative_cap = 45 if intensity == "forte" else 35
    bounded_cap = min(capacity.max_questions, conservative_cap)
    return max(1, min(max(adjusted_load, lower_bound), bounded_cap))
