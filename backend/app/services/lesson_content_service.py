from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from app.models import Block, BlockMastery, BlockSubject, LessonContent, MockExamQuestion, RoadmapNode, StudyEvent, Subject
from app.schemas import (
    LessonA1RecoveryBlockResponse,
    LessonContentCreate,
    LessonContentResponse,
    LessonContentUpdate,
    LessonExtraLink,
    LessonSavedErrorResponse,
    LessonStudiedSubjectResponse,
)
from app.services.study_event_service import record_study_event


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


def _subject_name(subject: Subject | None) -> str | None:
    if subject is None:
        return None
    if subject.subassunto:
        return f"{subject.assunto} - {subject.subassunto}"
    return subject.assunto


def list_a1_recovery_blocks(session: Session) -> list[LessonA1RecoveryBlockResponse]:
    rows = session.exec(
        select(BlockMastery, Block)
        .join(Block, Block.id == BlockMastery.block_id)
        .where(BlockMastery.eaere_stage.startswith("EX"))
        .order_by(BlockMastery.eaere_stage, Block.disciplina, Block.ordem, Block.id)
    ).all()
    responses: list[LessonA1RecoveryBlockResponse] = []
    for mastery, block in rows:
        subject = session.exec(
            select(Subject)
            .join(BlockSubject, BlockSubject.subject_id == Subject.id)
            .where(BlockSubject.block_id == block.id)
            .order_by(Subject.id)
        ).first()
        saved_errors_count = session.exec(
            select(MockExamQuestion)
            .where(MockExamQuestion.block_id == block.id)
            .where(MockExamQuestion.source_type == "saved_bank")
            .where(MockExamQuestion.is_correct == False)  # noqa: E712
        ).all()
        responses.append(
            LessonA1RecoveryBlockResponse(
                block_id=block.id or 0,
                block_name=block.nome,
                discipline=block.disciplina,
                subject_id=subject.id if subject is not None else None,
                subject_name=_subject_name(subject),
                eaere_stage=mastery.eaere_stage,
                ex_moving_average=mastery.ex_moving_average,
                mastery_score=mastery.score_domino,
                saved_errors_count=len(saved_errors_count),
            )
        )
    return responses


def list_saved_errors_by_block(session: Session, block_id: int) -> list[LessonSavedErrorResponse]:
    block = session.get(Block, block_id)
    if block is None:
        raise ValueError("Bloco nao encontrado.")
    rows = session.exec(
        select(MockExamQuestion)
        .where(MockExamQuestion.block_id == block_id)
        .where(MockExamQuestion.source_type == "saved_bank")
        .where(MockExamQuestion.is_correct == False)  # noqa: E712
        .order_by(MockExamQuestion.created_at.desc(), MockExamQuestion.question_number)
    ).all()
    return [
        LessonSavedErrorResponse(
            id=row.id or 0,
            question_number=row.question_number,
            subject_id=row.subject_id,
            prompt_markdown=row.prompt_markdown,
            correct_answer=row.correct_answer,
            user_answer=row.user_answer,
            difficulty_percent=row.difficulty_percent,
            time_seconds=row.time_seconds,
            notes=row.notes,
            created_at=row.created_at.isoformat(),
        )
        for row in rows
    ]


def list_lesson_studied_subjects(session: Session) -> list[LessonStudiedSubjectResponse]:
    rows = session.exec(
        select(StudyEvent)
        .where(StudyEvent.event_type == "lesson_studied")
        .where(StudyEvent.subject_id.is_not(None))
        .order_by(StudyEvent.created_at.desc(), StudyEvent.id.desc())
    ).all()
    seen: set[int] = set()
    responses: list[LessonStudiedSubjectResponse] = []
    for event in rows:
        if event.subject_id is None or event.subject_id in seen:
            continue
        subject = session.get(Subject, event.subject_id)
        if subject is None:
            continue
        seen.add(event.subject_id)
        responses.append(
            LessonStudiedSubjectResponse(
                subject_id=event.subject_id,
                block_id=event.block_id,
                discipline=event.discipline or subject.disciplina,
                subject_name=_subject_name(subject) or subject.assunto,
                studied_at=event.created_at.isoformat(),
            )
        )
    return responses


def mark_lesson_subject_studied(session: Session, subject_id: int) -> LessonStudiedSubjectResponse:
    subject = session.get(Subject, subject_id)
    if subject is None:
        raise ValueError("Assunto nao encontrado.")
    block = session.exec(
        select(Block)
        .join(BlockSubject, BlockSubject.block_id == Block.id)
        .where(BlockSubject.subject_id == subject_id)
        .order_by(Block.ordem, Block.id)
    ).first()
    block_id = block.id if block is not None else None
    subject_name = _subject_name(subject) or subject.assunto
    event = record_study_event(
        session,
        event_type="lesson_studied",
        title=f"A1 estudado em {subject.disciplina}",
        description=f"Ancoragem teorica marcada como estudada em {subject_name}.",
        discipline=subject.disciplina,
        block_id=block_id,
        subject_id=subject_id,
        metadata={"source": "lessons_page", "study_mode": "a1"},
    )
    session.commit()
    session.refresh(event)
    return LessonStudiedSubjectResponse(
        subject_id=subject_id,
        block_id=block_id,
        discipline=subject.disciplina,
        subject_name=subject_name,
        studied_at=event.created_at.isoformat(),
    )

