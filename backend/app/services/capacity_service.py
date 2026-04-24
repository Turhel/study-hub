from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from app.models import StudyCapacity
from app.schemas import StudyGuidePreferences, StudyGuidePreferencesResponse


VALID_INTENSITIES = {"leve", "normal", "forte"}


def get_or_create_capacity(session: Session) -> StudyCapacity:
    capacity = session.exec(select(StudyCapacity).order_by(StudyCapacity.id)).first()
    if capacity is not None:
        return capacity

    capacity = StudyCapacity(updated_at=datetime.utcnow())
    session.add(capacity)
    session.commit()
    session.refresh(capacity)
    return capacity


def _normalize_intensity(value: str | None) -> str:
    normalized = (value or "normal").strip().lower()
    if normalized not in VALID_INTENSITIES:
        return "normal"
    return normalized


def preferences_response(capacity: StudyCapacity) -> StudyGuidePreferencesResponse:
    return StudyGuidePreferencesResponse(
        daily_minutes=capacity.daily_minutes,
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
    capacity.daily_minutes = payload.daily_minutes
    capacity.intensity = _normalize_intensity(payload.intensity)
    capacity.max_focus_count = payload.max_focus_count
    capacity.max_questions = payload.max_questions
    capacity.include_reviews = payload.include_reviews
    capacity.include_new_content = payload.include_new_content
    capacity.updated_at = datetime.utcnow()
    session.add(capacity)
    session.commit()
    session.refresh(capacity)
    return preferences_response(capacity)


def safe_daily_question_load(capacity: StudyCapacity) -> int:
    base_load = 18 + (capacity.current_load_level * 4)

    if capacity.recent_fatigue_score >= 0.65:
        base_load -= 4
    if capacity.recent_overtime_rate >= 0.45:
        base_load -= 4
    if capacity.recent_completion_rate >= 0.82 and capacity.recent_fatigue_score <= 0.35:
        base_load += 4

    intensity = _normalize_intensity(capacity.intensity)
    if intensity == "leve":
        base_load = round(base_load * 0.72)
    elif intensity == "forte":
        base_load = round(base_load * 1.18)

    seconds_per_question = {
        "leve": 270,
        "normal": 210,
        "forte": 180,
    }[intensity]
    questions_by_time = max(4, (capacity.daily_minutes * 60) // seconds_per_question)
    review_reserve = 0.82 if capacity.include_reviews else 1.0
    adjusted_load = int(min(base_load, questions_by_time) * review_reserve)

    lower_bound = 8 if intensity == "leve" or capacity.daily_minutes < 45 else 12
    conservative_cap = 45 if intensity == "forte" else 35
    bounded_cap = min(capacity.max_questions, conservative_cap)
    return max(1, min(max(adjusted_load, lower_bound), bounded_cap))
