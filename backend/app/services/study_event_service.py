from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from app.models import StudyEvent
from app.schemas import ActivityItem
from app.services.discipline_normalization_service import normalize_discipline


def _metadata_json(metadata: dict[str, Any] | None) -> str:
    return json.dumps(metadata or {}, ensure_ascii=True, sort_keys=True)


def _metadata_dict(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        return {"raw_metadata": value}
    return payload if isinstance(payload, dict) else {"metadata": payload}


def record_study_event(
    session: Session,
    *,
    event_type: str,
    title: str,
    description: str,
    discipline: str | None = None,
    strategic_discipline: str | None = None,
    subarea: str | None = None,
    block_id: int | None = None,
    subject_id: int | None = None,
    metadata: dict[str, Any] | None = None,
    created_at: datetime | None = None,
) -> StudyEvent:
    normalized = normalize_discipline(discipline)
    event = StudyEvent(
        event_type=event_type,
        created_at=created_at or datetime.utcnow(),
        discipline=discipline,
        strategic_discipline=strategic_discipline or normalized.strategic_discipline or None,
        subarea=subarea or normalized.subarea or None,
        block_id=block_id,
        subject_id=subject_id,
        title=title,
        description=description,
        metadata_json=_metadata_json(metadata),
    )
    session.add(event)
    return event


def study_event_to_activity_item(event: StudyEvent) -> ActivityItem:
    metadata = _metadata_dict(event.metadata_json)
    metadata.setdefault("event_source", "study_events")
    return ActivityItem(
        type=event.event_type,  # type: ignore[arg-type]
        created_at=event.created_at.isoformat(),
        title=event.title,
        description=event.description,
        discipline=event.discipline,
        strategic_discipline=event.strategic_discipline,
        subarea=event.subarea,
        block_id=event.block_id,
        subject_id=event.subject_id,
        metadata=metadata,
    )


def list_recent_study_events(session: Session, limit: int = 100) -> list[ActivityItem]:
    events = session.exec(
        select(StudyEvent).order_by(StudyEvent.created_at.desc(), StudyEvent.id.desc()).limit(limit)
    ).all()
    return [study_event_to_activity_item(event) for event in events]
