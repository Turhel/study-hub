from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas import (
    ApiErrorResponse,
    EssayStudyMessageCreateRequest,
    EssayStudySessionCloseResponse,
    EssayStudySessionCreateRequest,
    EssayStudySessionListItem,
    EssayStudySessionResponse,
)
from app.settings import get_essay_study_enabled, get_llm_enabled
from app.services.essay_study_service import (
    EssayStudyError,
    EssayStudyProviderError,
    EssayStudyTokenLimitError,
    close_study_session,
    create_study_message,
    create_study_session,
    get_study_session,
    list_study_sessions_for_submission,
)


router = APIRouter(prefix="/api/essay")


def _ensure_essay_study_enabled() -> None:
    if not get_llm_enabled():
        raise HTTPException(
            status_code=503,
            detail={
                "code": "llm_disabled",
                "message": (
                    "LLM desabilitado nesta maquina. Estudo assistido de redacao indisponivel aqui. "
                    "Use um profile com LLM habilitado, como o desktop principal."
                ),
            },
        )
    if not get_essay_study_enabled():
        raise HTTPException(
            status_code=503,
            detail={
                "code": "essay_study_disabled",
                "message": (
                    "Estudo assistido de redacao desabilitado nesta maquina por feature flag. "
                    "Nenhuma tentativa de chamar o provider configurado sera feita."
                ),
            },
        )


@router.post(
    "/study-sessions",
    response_model=EssayStudySessionResponse,
    responses={
        400: {"model": ApiErrorResponse},
        502: {"model": ApiErrorResponse},
        503: {"model": ApiErrorResponse},
        504: {"model": ApiErrorResponse},
    },
)
def create_study_session_route(payload: EssayStudySessionCreateRequest) -> EssayStudySessionResponse:
    _ensure_essay_study_enabled()
    try:
        return create_study_session(payload.essay_correction_id)
    except EssayStudyTokenLimitError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.error_code, "message": str(exc)}) from exc
    except EssayStudyError as exc:
        status_code = 404 if "nao encontrada" in str(exc).lower() else 400
        code = "essay_correction_not_found" if status_code == 404 else "invalid_request"
        raise HTTPException(status_code=status_code, detail={"code": code, "message": str(exc)}) from exc
    except EssayStudyProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.error_code, "message": str(exc)}) from exc


@router.post(
    "/study-sessions/{session_id}/messages",
    response_model=EssayStudySessionResponse,
    responses={
        400: {"model": ApiErrorResponse},
        502: {"model": ApiErrorResponse},
        503: {"model": ApiErrorResponse},
        504: {"model": ApiErrorResponse},
    },
)
def create_study_message_route(session_id: int, payload: EssayStudyMessageCreateRequest) -> EssayStudySessionResponse:
    _ensure_essay_study_enabled()
    try:
        return create_study_message(session_id, payload.content)
    except EssayStudyTokenLimitError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.error_code, "message": str(exc)}) from exc
    except EssayStudyError as exc:
        status_code = 404 if "nao encontrada" in str(exc).lower() else 400
        code = "essay_study_session_not_found" if status_code == 404 else "invalid_request"
        raise HTTPException(status_code=status_code, detail={"code": code, "message": str(exc)}) from exc
    except EssayStudyProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.error_code, "message": str(exc)}) from exc


@router.post(
    "/study-sessions/{session_id}/close",
    response_model=EssayStudySessionCloseResponse,
    responses={400: {"model": ApiErrorResponse}, 404: {"model": ApiErrorResponse}},
)
def close_study_session_route(session_id: int) -> EssayStudySessionCloseResponse:
    try:
        return close_study_session(session_id)
    except EssayStudyTokenLimitError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.error_code, "message": str(exc)}) from exc
    except EssayStudyError as exc:
        status_code = 404 if "nao encontrada" in str(exc).lower() else 400
        code = "essay_study_session_not_found" if status_code == 404 else "invalid_request"
        raise HTTPException(status_code=status_code, detail={"code": code, "message": str(exc)}) from exc


@router.get(
    "/study-sessions/{session_id}",
    response_model=EssayStudySessionResponse,
    responses={404: {"model": ApiErrorResponse}},
)
def get_study_session_route(session_id: int) -> EssayStudySessionResponse:
    try:
        return get_study_session(session_id)
    except EssayStudyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"code": "essay_study_session_not_found", "message": str(exc)},
        ) from exc


@router.get(
    "/submissions/{submission_id}/study-sessions",
    response_model=list[EssayStudySessionListItem],
    responses={404: {"model": ApiErrorResponse}},
)
def list_study_sessions_for_submission_route(submission_id: int) -> list[EssayStudySessionListItem]:
    try:
        return list_study_sessions_for_submission(submission_id)
    except EssayStudyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"code": "essay_submission_not_found", "message": str(exc)},
        ) from exc
