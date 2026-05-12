from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.schemas import (
    ApiErrorResponse,
    EssayCorrectionCreateRequest,
    EssayCorrectionListItem,
    EssayCorrectionRequest,
    EssayCorrectionResponse,
    EssayCorrectionStoredResponse,
    EssayManualCorrectionRequest,
)
from app.settings import get_essay_correction_enabled, get_llm_enabled
from app.services.essay_service import (
    EssayCorrectionError,
    EssayCorrectionProviderError,
    EssayCorrectionTokenLimitError,
    correct_essay,
    create_essay_correction,
    create_manual_essay_correction,
    get_essay_correction,
    list_essay_corrections,
)


router = APIRouter(prefix="/api/essay")


def _ensure_essay_correction_enabled() -> None:
    if not get_llm_enabled():
        raise HTTPException(
            status_code=503,
            detail={
                "code": "llm_disabled",
                "message": (
                    "LLM desabilitado nesta maquina. Correcao de redacao indisponivel aqui. "
                    "Use um profile com LLM habilitado, como o desktop principal."
                ),
            },
        )
    if not get_essay_correction_enabled():
        raise HTTPException(
            status_code=503,
            detail={
                "code": "essay_correction_disabled",
                "message": (
                    "Correcao de redacao desabilitada nesta maquina por feature flag. "
                    "Isso evita tentar conectar ao provider configurado quando ele nao esta disponivel."
                ),
            },
        )


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
    _ensure_essay_correction_enabled()
    try:
        return correct_essay(payload)
    except EssayCorrectionTokenLimitError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.error_code, "message": str(exc)}) from exc
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
    _ensure_essay_correction_enabled()
    try:
        return create_essay_correction(payload)
    except EssayCorrectionTokenLimitError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.error_code, "message": str(exc)}) from exc
    except EssayCorrectionError as exc:
        raise HTTPException(status_code=400, detail={"code": "invalid_request", "message": str(exc)}) from exc
    except EssayCorrectionProviderError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.error_code, "message": str(exc)},
        ) from exc


@router.post(
    "/manual-corrections",
    response_model=EssayCorrectionStoredResponse,
    responses={400: {"model": ApiErrorResponse}},
)
def create_manual_essay_correction_route(payload: EssayManualCorrectionRequest) -> EssayCorrectionStoredResponse:
    try:
        return create_manual_essay_correction(payload)
    except EssayCorrectionError as exc:
        raise HTTPException(status_code=400, detail={"code": "invalid_request", "message": str(exc)}) from exc


@router.get(
    "/corrections",
    response_model=list[EssayCorrectionListItem],
    responses={400: {"model": ApiErrorResponse}},
)
def list_essay_corrections_route(limit: int = Query(default=20, ge=1, le=100)) -> list[EssayCorrectionListItem]:
    try:
        return list_essay_corrections(limit=limit)
    except EssayCorrectionError as exc:
        raise HTTPException(status_code=400, detail={"code": "invalid_request", "message": str(exc)}) from exc


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
