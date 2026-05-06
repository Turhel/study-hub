from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.db import get_session
from app.schemas import (
    ApiErrorResponse,
    BlockProgressDecisionRequest,
    BlockProgressDecisionResponse,
    DisciplineBlockProgressSnapshotResponse,
)
from app.services.block_decision_service import BlockDecisionError, save_block_progress_decision
from app.services.progression_service import get_discipline_progression_snapshot


router = APIRouter(prefix="/api/block-progress")


@router.post(
    "/decision",
    response_model=BlockProgressDecisionResponse,
    responses={
        400: {"model": ApiErrorResponse},
        404: {"model": ApiErrorResponse},
    },
)
def save_decision(payload: BlockProgressDecisionRequest) -> BlockProgressDecisionResponse:
    with get_session() as session:
        try:
            return save_block_progress_decision(session, payload)
        except BlockDecisionError as exc:
            message = str(exc)
            status_code = 404 if "nao encontrado" in message.lower() else 400
            raise HTTPException(
                status_code=status_code,
                detail={"code": "block_decision_invalid", "message": message},
            ) from exc


@router.get(
    "/discipline",
    response_model=DisciplineBlockProgressSnapshotResponse,
    responses={404: {"model": ApiErrorResponse}},
)
def get_discipline_snapshot_by_query(
    discipline: str = Query(..., min_length=1),
) -> DisciplineBlockProgressSnapshotResponse:
    with get_session() as session:
        try:
            return get_discipline_progression_snapshot(session, discipline)
        except ValueError as exc:
            raise HTTPException(
                status_code=404,
                detail={"code": "discipline_not_found", "message": str(exc)},
            ) from exc


@router.get(
    "/discipline/{discipline}",
    response_model=DisciplineBlockProgressSnapshotResponse,
    responses={404: {"model": ApiErrorResponse}},
)
def get_discipline_snapshot(discipline: str) -> DisciplineBlockProgressSnapshotResponse:
    with get_session() as session:
        try:
            return get_discipline_progression_snapshot(session, discipline)
        except ValueError as exc:
            raise HTTPException(
                status_code=404,
                detail={"code": "discipline_not_found", "message": str(exc)},
            ) from exc
