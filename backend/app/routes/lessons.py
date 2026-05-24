from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.db import get_session
from app.schemas import (
    LessonA1RecoveryBlockResponse,
    LessonContentCreate,
    LessonContentResponse,
    LessonContentUpdate,
    LessonSavedErrorResponse,
    LessonStudiedSubjectResponse,
)
from app.services.lesson_content_service import (
    create_lesson_content,
    delete_lesson_content,
    get_lesson_content,
    list_a1_recovery_blocks,
    list_lesson_contents,
    list_lesson_contents_by_roadmap_node,
    list_lesson_contents_by_subject,
    list_lesson_studied_subjects,
    list_saved_errors_by_block,
    mark_lesson_subject_studied,
    update_lesson_content,
)


router = APIRouter(prefix="/api/lessons")


@router.get("/contents", response_model=list[LessonContentResponse])
def read_lesson_contents(published_only: bool = Query(default=False)) -> list[LessonContentResponse]:
    with get_session() as session:
        return list_lesson_contents(session, published_only=published_only)


@router.get("/a1-recovery", response_model=list[LessonA1RecoveryBlockResponse])
def read_a1_recovery_blocks() -> list[LessonA1RecoveryBlockResponse]:
    with get_session() as session:
        return list_a1_recovery_blocks(session)


@router.get("/block-errors/{block_id}", response_model=list[LessonSavedErrorResponse])
def read_lesson_block_errors(block_id: int) -> list[LessonSavedErrorResponse]:
    with get_session() as session:
        try:
            return list_saved_errors_by_block(session, block_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/studied-subjects", response_model=list[LessonStudiedSubjectResponse])
def read_lesson_studied_subjects() -> list[LessonStudiedSubjectResponse]:
    with get_session() as session:
        return list_lesson_studied_subjects(session)


@router.post("/subjects/{subject_id}/studied", response_model=LessonStudiedSubjectResponse)
def mark_lesson_subject_as_studied(subject_id: int) -> LessonStudiedSubjectResponse:
    with get_session() as session:
        try:
            return mark_lesson_subject_studied(session, subject_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/contents/{content_id}", response_model=LessonContentResponse)
def read_lesson_content(content_id: int) -> LessonContentResponse:
    with get_session() as session:
        try:
            return get_lesson_content(session, content_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/contents", response_model=LessonContentResponse)
def create_lesson(payload: LessonContentCreate) -> LessonContentResponse:
    with get_session() as session:
        try:
            return create_lesson_content(session, payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/contents/{content_id}", response_model=LessonContentResponse)
def update_lesson(content_id: int, payload: LessonContentUpdate) -> LessonContentResponse:
    with get_session() as session:
        try:
            return update_lesson_content(session, content_id, payload)
        except ValueError as exc:
            message = str(exc)
            status_code = 404 if "nao encontrado" in message else 400
            raise HTTPException(status_code=status_code, detail=message) from exc


@router.delete("/contents/{content_id}", status_code=204)
def delete_lesson(content_id: int) -> None:
    with get_session() as session:
        try:
            delete_lesson_content(session, content_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/by-subject/{subject_id}", response_model=list[LessonContentResponse])
def read_lessons_by_subject(subject_id: int) -> list[LessonContentResponse]:
    with get_session() as session:
        try:
            return list_lesson_contents_by_subject(session, subject_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/by-roadmap-node/{node_id}", response_model=list[LessonContentResponse])
def read_lessons_by_roadmap_node(node_id: str) -> list[LessonContentResponse]:
    with get_session() as session:
        try:
            return list_lesson_contents_by_roadmap_node(session, node_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

