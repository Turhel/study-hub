from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas import (
    ApiErrorResponse,
    EssayCorrectionCreateRequest,
    EssayCorrectionRequest,
    EssayCorrectionResponse,
    EssayCorrectionStoredResponse,
)
from app.services.essay_service import (
    EssayCorrectionError,
    EssayCorrectionProviderError,
    correct_essay,
    create_essay_correction,
    get_essay_correction,
)


router = APIRouter(prefix="/api/essay")


@router.post(
    "/correct",
    response_model=EssayCorrectionResponse,
    responses={
        400: {"model": ApiErrorResponse},
        502: {"model": ApiErrorResponse},
        503: {"model": ApiErrorResponse},
        504: {"model": ApiErrorResponse},
    },
)
def correct_essay_route(payload: EssayCorrectionRequest) -> EssayCorrectionResponse:
    try:
        return correct_essay(payload)
    except EssayCorrectionError as exc:
        raise HTTPException(status_code=400, detail={"code": "invalid_request", "message": str(exc)}) from exc
    except EssayCorrectionProviderError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.error_code, "message": str(exc)},
        ) from exc


@router.post(
    "/corrections",
    response_model=EssayCorrectionStoredResponse,
    responses={
        400: {"model": ApiErrorResponse},
        502: {"model": ApiErrorResponse},
        503: {"model": ApiErrorResponse},
        504: {"model": ApiErrorResponse},
    },
)
def create_essay_correction_route(payload: EssayCorrectionCreateRequest) -> EssayCorrectionStoredResponse:
    try:
        return create_essay_correction(payload)
    except EssayCorrectionError as exc:
        raise HTTPException(status_code=400, detail={"code": "invalid_request", "message": str(exc)}) from exc
    except EssayCorrectionProviderError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.error_code, "message": str(exc)},
        ) from exc


@router.get(
    "/corrections/{correction_id}",
    response_model=EssayCorrectionStoredResponse,
    responses={400: {"model": ApiErrorResponse}, 404: {"model": ApiErrorResponse}},
)
def get_essay_correction_route(correction_id: int) -> EssayCorrectionStoredResponse:
    try:
        return get_essay_correction(correction_id)
    except EssayCorrectionError as exc:
        status_code = 404 if "nao encontrada" in str(exc).lower() else 400
        code = "essay_correction_not_found" if status_code == 404 else "invalid_request"
        raise HTTPException(status_code=status_code, detail={"code": code, "message": str(exc)}) from exc
