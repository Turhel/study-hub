from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_session
from app.schemas import (
    FreeStudyCatalogResponse,
    FreeStudySubjectContextResponse,
    QuestionAttemptBulkCreate,
    QuestionAttemptBulkCreateResponse,
)
from app.services.free_study_service import get_free_study_catalog, get_free_study_subject_context
from app.services.question_attempt_service import register_question_attempts_bulk


router = APIRouter(prefix="/api/free-study")


@router.get("/catalog", response_model=FreeStudyCatalogResponse)
def read_free_study_catalog() -> FreeStudyCatalogResponse:
    with get_session() as session:
        return get_free_study_catalog(session)


@router.get("/subjects/{subject_id}/context", response_model=FreeStudySubjectContextResponse)
def read_free_study_subject_context(subject_id: int) -> FreeStudySubjectContextResponse:
    with get_session() as session:
        try:
            return get_free_study_subject_context(session, subject_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/question-attempts/bulk", response_model=QuestionAttemptBulkCreateResponse)
def create_free_study_question_attempts_bulk(payload: QuestionAttemptBulkCreate) -> QuestionAttemptBulkCreateResponse:
    with get_session() as session:
        try:
            free_payload = payload.model_copy(update={"study_mode": "free"})
            return register_question_attempts_bulk(session, free_payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

