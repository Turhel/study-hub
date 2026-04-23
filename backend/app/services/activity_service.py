from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time
from typing import Any

from sqlalchemy import func
from sqlmodel import Session, select

from app.models import (
    Block,
    BlockProgress,
    DailyStudyPlan,
    DailyStudyPlanItem,
    QuestionAttempt,
    Review,
    StudyEvent,
    Subject,
)
from app.schemas import ActivityItem, ActivityTodayResponse
from app.services.discipline_normalization_service import normalize_discipline
from app.services.study_event_service import list_recent_study_events, study_event_to_activity_item


def _subject_label(subject: Subject | None, subject_id: int | None) -> str:
    if subject is None:
        return f"Assunto {subject_id}" if subject_id is not None else "Assunto nao identificado"
    if subject.subassunto:
        return f"{subject.assunto} - {subject.subassunto}"
    return subject.assunto


def _block_label(block: Block | None, block_id: int | None) -> str:
    if block is None:
        return f"Bloco {block_id}" if block_id is not None else "Bloco nao identificado"
    return block.nome


def _date_as_datetime(value: date, hour: int) -> datetime:
    return datetime.combine(value, time(hour=hour))


def _activity(
    *,
    activity_type: str,
    created_at: datetime,
    title: str,
    description: str,
    discipline: str | None = None,
    strategic_discipline: str | None = None,
    subarea: str | None = None,
    block_id: int | None = None,
    subject_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> ActivityItem:
    normalized = normalize_discipline(discipline)
    return ActivityItem(
        type=activity_type,  # type: ignore[arg-type]
        created_at=created_at.isoformat(),
        title=title,
        description=description,
        discipline=discipline,
        strategic_discipline=strategic_discipline or normalized.strategic_discipline or None,
        subarea=subarea or normalized.subarea or None,
        block_id=block_id,
        subject_id=subject_id,
        metadata=metadata or {},
    )


def _question_attempt_activities(session: Session, row_limit: int = 500) -> list[ActivityItem]:
    attempts = session.exec(
        select(QuestionAttempt).order_by(QuestionAttempt.data.desc(), QuestionAttempt.id.desc()).limit(row_limit)
    ).all()
    grouped: dict[tuple[date, str, int | None, int | None], list[QuestionAttempt]] = defaultdict(list)
    for attempt in attempts:
        grouped[(attempt.data, attempt.disciplina, attempt.block_id, attempt.subject_id)].append(attempt)

    items: list[ActivityItem] = []
    for (attempt_date, discipline, block_id, subject_id), group in grouped.items():
        block = session.get(Block, block_id) if block_id is not None else None
        subject = session.get(Subject, subject_id) if subject_id is not None else None
        created_attempts = len(group)
        correct_count = sum(1 for attempt in group if attempt.acertou)
        block_name = _block_label(block, block_id)
        subject_name = _subject_label(subject, subject_id)
        items.append(
            _activity(
                activity_type="question_attempt_bulk",
                created_at=_date_as_datetime(attempt_date, 12),
                title=f"Questoes registradas em {discipline}",
                description=f"{created_attempts} tentativas registradas em {block_name} - {subject_name}.",
                discipline=discipline,
                block_id=block_id,
                subject_id=subject_id,
                metadata={
                    "created_attempts": created_attempts,
                    "correct_count": correct_count,
                    "incorrect_count": created_attempts - correct_count,
                    "inferred_from": "question_attempts_grouped_by_date_block_subject",
                },
            )
        )
    return items


def _review_activities(session: Session, row_limit: int = 100) -> list[ActivityItem]:
    reviews = session.exec(
        select(Review)
        .where(Review.ultima_data.is_not(None))
        .order_by(Review.ultima_data.desc(), Review.id.desc())
        .limit(row_limit)
    ).all()
    items: list[ActivityItem] = []
    for review in reviews:
        subject = session.get(Subject, review.subject_id) if review.subject_id is not None else None
        block = session.get(Block, review.block_id) if review.block_id is not None else None
        subject_name = _subject_label(subject, review.subject_id)
        block_name = _block_label(block, review.block_id)
        discipline = subject.disciplina if subject is not None else block.disciplina if block is not None else None
        items.append(
            _activity(
                activity_type="review_upsert",
                created_at=_date_as_datetime(review.ultima_data or date.today(), 13),
                title=f"Revisao atualizada para {subject_name}",
                description=f"Revisao pendente de {block_name} programada para {review.proxima_data.isoformat()}.",
                discipline=discipline,
                block_id=review.block_id,
                subject_id=review.subject_id,
                metadata={
                    "review_id": review.id,
                    "status": review.status,
                    "result": review.resultado,
                    "interval_days": review.intervalo_dias,
                    "next_review_date": review.proxima_data.isoformat(),
                    "inferred_from": "reviews.ultima_data",
                },
            )
        )
    return items


def _daily_plan_activities(session: Session, row_limit: int = 30) -> list[ActivityItem]:
    plans = session.exec(
        select(DailyStudyPlan).order_by(DailyStudyPlan.created_at.desc(), DailyStudyPlan.id.desc()).limit(row_limit)
    ).all()
    items: list[ActivityItem] = []
    for plan in plans:
        focus_count = session.exec(
            select(func.count(DailyStudyPlanItem.id)).where(DailyStudyPlanItem.plan_id == plan.id)
        ).one()
        items.append(
            _activity(
                activity_type="daily_plan_generated",
                created_at=plan.created_at,
                title="Plano diario gerado",
                description=(
                    f"Plano diario gerado com {plan.total_planned_questions} questoes "
                    f"em {int(focus_count or 0)} focos."
                ),
                metadata={
                    "plan_id": plan.id,
                    "status": plan.status,
                    "total_planned_questions": plan.total_planned_questions,
                    "focus_count": int(focus_count or 0),
                },
            )
        )
    return items


def _decision_date(progress: BlockProgress) -> date | None:
    return progress.approved_at or progress.unlocked_at


def _block_decision_activities(session: Session, row_limit: int = 100) -> list[ActivityItem]:
    progresses = session.exec(
        select(BlockProgress).where(BlockProgress.user_decision != "continue_current").limit(row_limit)
    ).all()
    items: list[ActivityItem] = []
    for progress in progresses:
        decision_date = _decision_date(progress)
        if decision_date is None:
            continue
        block = session.get(Block, progress.block_id)
        block_name = _block_label(block, progress.block_id)
        discipline = block.disciplina if block is not None else None
        items.append(
            _activity(
                activity_type="block_progress_decision",
                created_at=_date_as_datetime(decision_date, 14),
                title=f"Decisao de progressao em {block_name}",
                description=f"Decisao salva: {progress.user_decision}. Status atual do bloco: {progress.status}.",
                discipline=discipline,
                block_id=progress.block_id,
                metadata={
                    "user_decision": progress.user_decision,
                    "current_status": progress.status,
                    "inferred_from": "block_progress.approved_at_or_unlocked_at",
                },
            )
        )
    return items


def _dedupe_key(item: ActivityItem) -> tuple[str, str, int | None, int | None]:
    event_date = item.created_at[:10]
    return (item.type, event_date, item.block_id, item.subject_id)


def _merge_prefer_real_events(
    real_items: list[ActivityItem],
    inferred_items: list[ActivityItem],
) -> list[ActivityItem]:
    seen = {_dedupe_key(item) for item in real_items}
    merged = list(real_items)
    for item in inferred_items:
        if _dedupe_key(item) in seen:
            continue
        merged.append(item)
        seen.add(_dedupe_key(item))
    return merged


def get_recent_activity(session: Session, limit: int = 30) -> list[ActivityItem]:
    bounded_limit = max(1, min(limit, 100))
    real_items = list_recent_study_events(session, limit=bounded_limit)
    inferred_items = [
        *_question_attempt_activities(session),
        *_review_activities(session),
        *_daily_plan_activities(session),
        *_block_decision_activities(session),
    ]
    items = _merge_prefer_real_events(real_items, inferred_items)
    return sorted(items, key=lambda item: item.created_at, reverse=True)[:bounded_limit]


def _events_created_today(session: Session, today: date) -> list[StudyEvent]:
    start = datetime.combine(today, time.min)
    end = datetime.combine(today, time.max)
    return session.exec(
        select(StudyEvent)
        .where(StudyEvent.created_at >= start)
        .where(StudyEvent.created_at <= end)
        .order_by(StudyEvent.created_at.desc(), StudyEvent.id.desc())
    ).all()


def _event_metadata_int(event: StudyEvent, key: str, default: int = 0) -> int:
    activity = study_event_to_activity_item(event)
    value = activity.metadata.get(key, default)
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def get_today_activity_summary(session: Session) -> ActivityTodayResponse:
    today = date.today()
    events_today = _events_created_today(session, today)
    question_events = [event for event in events_today if event.event_type == "question_attempt_bulk"]
    review_events = [event for event in events_today if event.event_type == "review_upsert"]
    decision_events = [event for event in events_today if event.event_type == "block_progress_decision"]

    attempts = session.exec(select(QuestionAttempt).where(QuestionAttempt.data == today)).all()
    attempt_subject_ids = {attempt.subject_id for attempt in attempts if attempt.subject_id is not None}
    attempt_block_ids = {attempt.block_id for attempt in attempts if attempt.block_id is not None}
    event_subject_ids = {event.subject_id for event in question_events if event.subject_id is not None}
    event_block_ids = {event.block_id for event in events_today if event.block_id is not None}
    studied_subject_ids = sorted(
        event_subject_ids | attempt_subject_ids
    )
    impacted_block_ids = sorted(event_block_ids | attempt_block_ids)
    if question_events:
        question_attempts_registered = sum(
            _event_metadata_int(event, "created_attempts", 1)
            for event in question_events
        )
    else:
        question_attempts_registered = len(attempts)

    inferred_reviews_today = int(
        session.exec(select(func.count(Review.id)).where(Review.ultima_data == today)).one() or 0
    )
    reviews_generated_today = len(review_events) if review_events else inferred_reviews_today
    decisions_today = [
        progress
        for progress in session.exec(select(BlockProgress).where(BlockProgress.user_decision != "continue_current"))
        if _decision_date(progress) == today
    ]
    progression_decisions_today = len(decision_events) if decision_events else len(decisions_today)
    return ActivityTodayResponse(
        date=today.isoformat(),
        question_attempts_registered=question_attempts_registered,
        subjects_studied_today=len(studied_subject_ids),
        blocks_impacted_today=len(impacted_block_ids),
        reviews_generated_today=reviews_generated_today,
        progression_decisions_today=progression_decisions_today,
        studied_subject_ids=studied_subject_ids,
        impacted_block_ids=impacted_block_ids,
    )
