from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from app.models import LessonContent, RoadmapNode, Subject
from app.schemas import LessonContentCreate, LessonContentResponse, LessonContentUpdate, LessonExtraLink


def _extra_links_json(extra_links: list[LessonExtraLink] | None) -> str:
    return json.dumps(
        [item.model_dump() for item in (extra_links or [])],
        ensure_ascii=True,
        sort_keys=True,
    )


def _extra_links(value: str | None) -> list[LessonExtraLink]:
    if not value:
        return []
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []
    links: list[LessonExtraLink] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        label = item.get("label")
        url = item.get("url")
        if isinstance(label, str) and isinstance(url, str) and label and url:
            links.append(LessonExtraLink(label=label, url=url))
    return links


def _validate_references(session: Session, roadmap_node_id: str | None, subject_id: int | None) -> None:
    if roadmap_node_id is None and subject_id is None:
        raise ValueError("Informe roadmap_node_id ou subject_id.")
    if subject_id is not None and session.get(Subject, subject_id) is None:
        raise ValueError("Assunto nao encontrado.")
    if roadmap_node_id is not None:
        node = session.exec(select(RoadmapNode).where(RoadmapNode.node_id == roadmap_node_id)).first()
        if node is None:
            raise ValueError("Roadmap node nao encontrado.")


def _to_response(content: LessonContent) -> LessonContentResponse:
    return LessonContentResponse(
        id=content.id or 0,
        roadmap_node_id=content.roadmap_node_id,
        subject_id=content.subject_id,
        title=content.title,
        body_markdown=content.body_markdown,
        youtube_url=content.youtube_url,
        extra_links=_extra_links(content.extra_links_json),
        notes=content.notes,
        is_published=content.is_published,
        created_at=content.created_at.isoformat(),
        updated_at=content.updated_at.isoformat(),
    )


def list_lesson_contents(session: Session, *, published_only: bool = False) -> list[LessonContentResponse]:
    statement = select(LessonContent).order_by(LessonContent.updated_at.desc(), LessonContent.id.desc())
    if published_only:
        statement = statement.where(LessonContent.is_published == True)  # noqa: E712
    return [_to_response(item) for item in session.exec(statement).all()]


def get_lesson_content(session: Session, content_id: int) -> LessonContentResponse:
    content = session.get(LessonContent, content_id)
    if content is None:
        raise ValueError("Conteudo de aula nao encontrado.")
    return _to_response(content)


def create_lesson_content(session: Session, payload: LessonContentCreate) -> LessonContentResponse:
    _validate_references(session, payload.roadmap_node_id, payload.subject_id)
    now = datetime.utcnow()
    content = LessonContent(
        roadmap_node_id=payload.roadmap_node_id,
        subject_id=payload.subject_id,
        title=payload.title.strip(),
        body_markdown=payload.body_markdown,
        youtube_url=payload.youtube_url,
        extra_links_json=_extra_links_json(payload.extra_links),
        notes=payload.notes,
        is_published=payload.is_published,
        created_at=now,
        updated_at=now,
    )
    session.add(content)
    session.commit()
    session.refresh(content)
    return _to_response(content)


def update_lesson_content(session: Session, content_id: int, payload: LessonContentUpdate) -> LessonContentResponse:
    content = session.get(LessonContent, content_id)
    if content is None:
        raise ValueError("Conteudo de aula nao encontrado.")

    updates: dict[str, Any] = payload.model_dump(exclude_unset=True)
    next_roadmap_node_id = updates.get("roadmap_node_id", content.roadmap_node_id)
    next_subject_id = updates.get("subject_id", content.subject_id)
    _validate_references(session, next_roadmap_node_id, next_subject_id)

    if "roadmap_node_id" in updates:
        content.roadmap_node_id = next_roadmap_node_id
    if "subject_id" in updates:
        content.subject_id = next_subject_id
    if "title" in updates and payload.title is not None:
        content.title = payload.title.strip()
    if "body_markdown" in updates and payload.body_markdown is not None:
        content.body_markdown = payload.body_markdown
    if "youtube_url" in updates:
        content.youtube_url = payload.youtube_url
    if "extra_links" in updates:
        content.extra_links_json = _extra_links_json(payload.extra_links)
    if "notes" in updates:
        content.notes = payload.notes
    if "is_published" in updates and payload.is_published is not None:
        content.is_published = payload.is_published

    content.updated_at = datetime.utcnow()
    session.add(content)
    session.commit()
    session.refresh(content)
    return _to_response(content)


def delete_lesson_content(session: Session, content_id: int) -> None:
    content = session.get(LessonContent, content_id)
    if content is None:
        raise ValueError("Conteudo de aula nao encontrado.")
    session.delete(content)
    session.commit()


def list_lesson_contents_by_subject(session: Session, subject_id: int) -> list[LessonContentResponse]:
    if session.get(Subject, subject_id) is None:
        raise ValueError("Assunto nao encontrado.")
    rows = session.exec(
        select(LessonContent)
        .where(LessonContent.subject_id == subject_id)
        .order_by(LessonContent.updated_at.desc(), LessonContent.id.desc())
    ).all()
    return [_to_response(item) for item in rows]


def list_lesson_contents_by_roadmap_node(session: Session, node_id: str) -> list[LessonContentResponse]:
    node = session.exec(select(RoadmapNode).where(RoadmapNode.node_id == node_id)).first()
    if node is None:
        raise ValueError("Roadmap node nao encontrado.")
    rows = session.exec(
        select(LessonContent)
        .where(LessonContent.roadmap_node_id == node_id)
        .order_by(LessonContent.updated_at.desc(), LessonContent.id.desc())
    ).all()
    return [_to_response(item) for item in rows]

