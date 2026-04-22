from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from app.models import StudyCapacity


def get_or_create_capacity(session: Session) -> StudyCapacity:
    capacity = session.exec(select(StudyCapacity).order_by(StudyCapacity.id)).first()
    if capacity is not None:
        return capacity

    capacity = StudyCapacity(updated_at=datetime.utcnow())
    session.add(capacity)
    session.commit()
    session.refresh(capacity)
    return capacity


def safe_daily_question_load(capacity: StudyCapacity) -> int:
    base_load = 18 + (capacity.current_load_level * 4)

    if capacity.recent_fatigue_score >= 0.65:
        base_load -= 4
    if capacity.recent_overtime_rate >= 0.45:
        base_load -= 4
    if capacity.recent_completion_rate >= 0.82 and capacity.recent_fatigue_score <= 0.35:
        base_load += 4

    return max(20, min(base_load, 35))
