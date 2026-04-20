from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from app.models import TimerSession, TimerSessionItem
from app.schemas import TimerSessionCreate, TimerSessionRecentItem


def _parse_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def create_timer_session(session: Session, payload: TimerSessionCreate) -> TimerSession:
    timer_session = TimerSession(
        discipline=payload.discipline,
        block_name=payload.block_name,
        subject_name=payload.subject_name,
        mode=payload.mode,
        planned_questions=payload.planned_questions,
        target_seconds_per_question=payload.target_seconds_per_question,
        total_elapsed_seconds=payload.total_elapsed_seconds,
        completed_count=payload.completed_count,
        skipped_count=payload.skipped_count,
        overtime_count=payload.overtime_count,
        average_seconds_completed=payload.average_seconds_completed,
        difficulty_general=payload.difficulty_general,
        volume_perceived=payload.volume_perceived,
        notes=payload.notes,
    )
    session.add(timer_session)
    session.flush()
    session.refresh(timer_session)

    for item in payload.items:
        session.add(
            TimerSessionItem(
                session_id=timer_session.id or 0,
                question_number=item.question_number,
                status=item.status,
                elapsed_seconds=item.elapsed_seconds,
                exceeded_target=item.exceeded_target,
                completed_at=_parse_datetime(item.completed_at),
            )
        )

    session.commit()
    session.refresh(timer_session)
    return timer_session


def recent_timer_sessions(session: Session, limit: int = 10) -> list[TimerSessionRecentItem]:
    rows = session.exec(
        select(TimerSession)
        .order_by(TimerSession.created_at.desc())
        .limit(limit)
    ).all()

    return [
        TimerSessionRecentItem(
            id=row.id or 0,
            created_at=row.created_at.isoformat(),
            discipline=row.discipline,
            block_name=row.block_name,
            subject_name=row.subject_name,
            mode=row.mode,
            planned_questions=row.planned_questions,
            completed_count=row.completed_count,
            skipped_count=row.skipped_count,
            total_elapsed_seconds=row.total_elapsed_seconds,
            average_seconds_completed=row.average_seconds_completed,
        )
        for row in rows
    ]
