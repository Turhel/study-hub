from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import delete, func, inspect
from sqlmodel import Session, select

from app.models import (
    BlockMastery,
    BlockProgress,
    DailyStudyPlan,
    DailyStudyPlanItem,
    EssayCorrection,
    EssayStudyMessage,
    EssayStudySession,
    EssaySubmission,
    MockExam,
    QuestionAttempt,
    Review,
    StudyCapacity,
    StudyEvent,
    SubjectProgress,
    TimerSession,
    TimerSessionItem,
)
from app.schemas import ResetStudyDataRequest, ResetStudyDataResponse
from app.services.progression_service import sync_progression


RESET_STUDY_CONFIRMATION_TEXT = "RESETAR ESTUDOS"


@dataclass(frozen=True)
class _TableSpec:
    label: str
    table_name: str
    model: type


STRUCTURAL_TABLES = (
    "subjects",
    "blocks",
    "block_subjects",
    "roadmap_nodes",
    "roadmap_edges",
    "roadmap_block_map",
    "roadmap_rules",
    "lesson_contents",
)

USAGE_DELETE_SPECS = [
    _TableSpec("question_attempts", "question_attempts", QuestionAttempt),
    _TableSpec("reviews", "reviews", Review),
    _TableSpec("study_events", "study_events", StudyEvent),
    _TableSpec("daily_study_plan_items", "daily_study_plan_items", DailyStudyPlanItem),
    _TableSpec("daily_study_plan", "daily_study_plan", DailyStudyPlan),
    _TableSpec("timer_session_items", "timer_session_items", TimerSessionItem),
    _TableSpec("timer_sessions", "timer_sessions", TimerSession),
    _TableSpec("mock_exams", "mock_exams", MockExam),
]

PROGRESS_RESET_SPECS = [
    _TableSpec("block_mastery", "block_mastery", BlockMastery),
    _TableSpec("block_progress", "block_progress", BlockProgress),
    _TableSpec("subject_progress", "subject_progress", SubjectProgress),
]

ESSAY_DELETE_SPECS = [
    _TableSpec("essay_study_messages", "essay_study_messages", EssayStudyMessage),
    _TableSpec("essay_study_sessions", "essay_study_sessions", EssayStudySession),
    _TableSpec("essay_corrections", "essay_corrections", EssayCorrection),
    _TableSpec("essay_submissions", "essay_submissions", EssaySubmission),
]


def _table_exists(session: Session, table_name: str) -> bool:
    bind = session.get_bind()
    return bool(bind is not None and inspect(bind).has_table(table_name))


def _count_rows(session: Session, model: type) -> int:
    return int(session.exec(select(func.count()).select_from(model)).one() or 0)


def _delete_all_rows(session: Session, model: type) -> None:
    session.exec(delete(model))


def _reset_capacity_to_defaults(session: Session) -> int:
    capacity = session.exec(select(StudyCapacity).order_by(StudyCapacity.id)).first()
    if capacity is None:
        capacity = StudyCapacity()
        session.add(capacity)

    defaults = StudyCapacity()
    capacity.current_load_level = defaults.current_load_level
    capacity.recent_fatigue_score = defaults.recent_fatigue_score
    capacity.recent_completion_rate = defaults.recent_completion_rate
    capacity.recent_overtime_rate = defaults.recent_overtime_rate
    capacity.daily_minutes = defaults.daily_minutes
    capacity.intensity = defaults.intensity
    capacity.max_focus_count = defaults.max_focus_count
    capacity.max_questions = defaults.max_questions
    capacity.include_reviews = defaults.include_reviews
    capacity.include_new_content = defaults.include_new_content
    capacity.updated_at = datetime.utcnow()
    session.add(capacity)
    return 1


def reset_study_data(session: Session, payload: ResetStudyDataRequest) -> ResetStudyDataResponse:
    if payload.confirmation_text != RESET_STUDY_CONFIRMATION_TEXT:
        raise ValueError("Digite exatamente RESETAR ESTUDOS para continuar.")

    deleted_counts: dict[str, int] = {}
    reset_counts: dict[str, int] = {}
    warnings: list[str] = []

    for spec in [*USAGE_DELETE_SPECS, *PROGRESS_RESET_SPECS, *ESSAY_DELETE_SPECS]:
        should_include = payload.include_essays or spec not in ESSAY_DELETE_SPECS
        if should_include and _table_exists(session, spec.table_name):
            deleted_counts[spec.label] = _count_rows(session, spec.model)
        elif not should_include:
            deleted_counts[spec.label] = 0
        else:
            deleted_counts[spec.label] = 0
            warnings.append(f"Tabela opcional ausente: {spec.table_name}")

    if _table_exists(session, StudyCapacity.__tablename__):
        reset_counts["study_capacity_rows"] = _count_rows(session, StudyCapacity)
    else:
        reset_counts["study_capacity_rows"] = 0
        warnings.append("Tabela opcional ausente: study_capacity")

    if payload.dry_run:
        return ResetStudyDataResponse(
            dry_run=True,
            deleted_counts=deleted_counts,
            reset_counts=reset_counts,
            preserved_tables=list(STRUCTURAL_TABLES),
            preferences_reset=payload.reset_preferences,
            essays_deleted=payload.include_essays,
            warnings=warnings,
        )

    try:
        for spec in USAGE_DELETE_SPECS:
            if _table_exists(session, spec.table_name):
                _delete_all_rows(session, spec.model)

        for spec in PROGRESS_RESET_SPECS:
            if _table_exists(session, spec.table_name):
                _delete_all_rows(session, spec.model)

        if payload.include_essays:
            for spec in ESSAY_DELETE_SPECS:
                if _table_exists(session, spec.table_name):
                    _delete_all_rows(session, spec.model)

        if payload.reset_preferences and _table_exists(session, StudyCapacity.__tablename__):
            reset_counts["study_capacity_reset"] = _reset_capacity_to_defaults(session)
        else:
            reset_counts["study_capacity_reset"] = 0

        session.commit()
    except Exception:
        session.rollback()
        raise

    sync_progression(session, date.today())

    reset_counts["block_progress_after_sync"] = (
        _count_rows(session, BlockProgress) if _table_exists(session, BlockProgress.__tablename__) else 0
    )
    reset_counts["subject_progress_after_sync"] = (
        _count_rows(session, SubjectProgress) if _table_exists(session, SubjectProgress.__tablename__) else 0
    )
    reset_counts["block_mastery_after_reset"] = (
        _count_rows(session, BlockMastery) if _table_exists(session, BlockMastery.__tablename__) else 0
    )

    session.commit()

    return ResetStudyDataResponse(
        dry_run=False,
        deleted_counts=deleted_counts,
        reset_counts=reset_counts,
        preserved_tables=list(STRUCTURAL_TABLES),
        preferences_reset=payload.reset_preferences,
        essays_deleted=payload.include_essays,
        warnings=warnings,
    )
