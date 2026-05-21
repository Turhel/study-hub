from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_session
from app.schemas import QuestionAttemptBulkCreate, QuestionAttemptBulkCreateResponse
from app.services.question_attempt_service import register_question_attempts_bulk


router = APIRouter(prefix="/api/question-attempts")


@router.post("/bulk", response_model=QuestionAttemptBulkCreateResponse)
def create_question_attempts_bulk(payload: QuestionAttemptBulkCreate) -> QuestionAttemptBulkCreateResponse:
    with get_session() as session:
        try:
            return register_question_attempts_bulk(session, payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/quick-sync", response_model=QuestionAttemptBulkCreateResponse)
def sync_quick_attempts(payload: QuestionAttemptBulkCreate) -> QuestionAttemptBulkCreateResponse:
    """
    Injeta diretamente os dados consolidados do timer minimalista da V2
    aproveitando o motor de bulk original para não quebrar a árvore de maestria.
    """
    with get_session() as session:
        try:
            return register_question_attempts_bulk(session, payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
