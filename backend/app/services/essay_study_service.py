from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from app.db import get_session
from app.llm.prompt_loader import PromptLoadError, load_prompt_file
from app.llm.providers.lm_studio import LMStudioMessage
from app.llm.tasks import (
    LLMTaskConnectionError,
    LLMTaskResponseError,
    LLMTaskTimeoutError,
    estimate_messages_tokens,
    estimate_tokens,
    run_chat_messages,
)
from app.models import EssayStudyMessage, EssayStudySession
from app.schemas import (
    EssayStudyMessageResponse,
    EssayStudySessionCloseResponse,
    EssayStudySessionListItem,
    EssayStudySessionResponse,
)
from app.services.essay_service import EssayCorrectionError, get_submission_for_correction, get_essay_correction
from app.settings import get_env_int


class EssayStudyError(ValueError):
    pass


class EssayStudyTokenLimitError(EssayStudyError):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.error_code = "essay_study_token_limit_exceeded"
        self.status_code = 400


class EssayStudyProviderError(RuntimeError):
    def __init__(self, message: str, error_code: str = "essay_study_provider_error", status_code: int = 502) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.status_code = status_code


class EssayStudyUnavailableError(EssayStudyProviderError):
    def __init__(self, message: str) -> None:
        super().__init__(message, error_code="lm_unavailable", status_code=503)


class EssayStudyTimeoutError(EssayStudyProviderError):
    def __init__(self, message: str) -> None:
        super().__init__(message, error_code="lm_timeout", status_code=504)


class EssayStudyInvalidResponseError(EssayStudyProviderError):
    def __init__(self, message: str) -> None:
        super().__init__(message, error_code="lm_invalid_response", status_code=502)


class EssayStudyPromptError(EssayStudyProviderError):
    def __init__(self, message: str) -> None:
        super().__init__(message, error_code="prompt_not_found", status_code=500)


def _study_token_limit() -> int:
    return get_env_int("STUDY_HUB_LLM_ESSAY_STUDY_TOKEN_LIMIT", 60000, minimum=1000)


def _to_message_response(message: EssayStudyMessage) -> EssayStudyMessageResponse:
    return EssayStudyMessageResponse(
        id=message.id or 0,
        role=message.role,  # type: ignore[arg-type]
        content=message.content,
        tokens_estimated=message.tokens_estimated,
        created_at=message.created_at.isoformat(),
    )


def _to_session_response(session: EssayStudySession, messages: list[EssayStudyMessage]) -> EssayStudySessionResponse:
    tokens_input = sum(item.tokens_estimated for item in messages if item.role in {"system", "user"})
    tokens_output = sum(item.tokens_estimated for item in messages if item.role == "assistant")
    return EssayStudySessionResponse(
        id=session.id or 0,
        essay_submission_id=session.essay_submission_id,
        essay_correction_id=session.essay_correction_id,
        provider=session.provider,
        model=session.model,
        prompt_name=session.prompt_name,
        prompt_hash=session.prompt_hash,
        tokens_input=tokens_input,
        tokens_output=tokens_output,
        status=session.status,  # type: ignore[arg-type]
        tokens_total=session.tokens_total,
        started_at=session.started_at.isoformat(),
        ended_at=session.ended_at.isoformat() if session.ended_at else None,
        messages=[_to_message_response(item) for item in messages],
    )


def _render_correction_snapshot(correction_id: int, db: Session) -> str:
    correction = get_essay_correction(correction_id, session=db)
    competencies = "\n".join(
        f"{key}: nota {value.score}. Comentario: {value.comment}"
        for key, value in correction.competencies.items()
    )
    strengths = "\n".join(f"- {item}" for item in correction.strengths)
    weaknesses = "\n".join(f"- {item}" for item in correction.weaknesses)
    improvement_plan = "\n".join(f"- {item}" for item in correction.improvement_plan)
    return (
        f"TEMA:\n{correction.submission.theme}\n\n"
        f"REDACAO:\n{correction.submission.essay_text}\n\n"
        "CORRECAO SALVA:\n"
        f"Faixa estimada: {correction.estimated_score_range.min}-{correction.estimated_score_range.max}\n"
        f"{competencies}\n\n"
        f"Pontos fortes:\n{strengths}\n\n"
        f"Fraquezas:\n{weaknesses}\n\n"
        f"Plano de melhoria:\n{improvement_plan}\n\n"
        f"Observacao de confianca:\n{correction.confidence_note}"
    )


def _append_message(
    db: Session,
    session_id: int,
    role: str,
    content: str,
    tokens_estimated: int | None = None,
) -> EssayStudyMessage:
    message = EssayStudyMessage(
        session_id=session_id,
        role=role,
        content=content,
        tokens_estimated=tokens_estimated if tokens_estimated is not None else estimate_tokens(content),
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def _refresh_session_tokens(db: Session, study_session: EssayStudySession) -> EssayStudySession:
    messages = list(
        db.exec(
            select(EssayStudyMessage).where(EssayStudyMessage.session_id == study_session.id).order_by(EssayStudyMessage.created_at.asc())
        )
    )
    study_session.tokens_total = sum(item.tokens_estimated for item in messages)
    db.add(study_session)
    db.commit()
    db.refresh(study_session)
    return study_session


def _ensure_active_session(study_session: EssayStudySession) -> None:
    if study_session.status == "token_limit_reached":
        raise EssayStudyTokenLimitError("A sessao de estudo ja atingiu o limite de tokens e nao pode continuar.")
    if study_session.status == "closed":
        raise EssayStudyError("A sessao de estudo ja foi encerrada.")


def _mark_token_limit_reached(db: Session, study_session: EssayStudySession) -> EssayStudySession:
    study_session.status = "token_limit_reached"
    study_session.ended_at = datetime.utcnow()
    db.add(study_session)
    db.commit()
    db.refresh(study_session)
    return study_session


def create_study_session(essay_correction_id: int, session: Session | None = None) -> EssayStudySessionResponse:
    own_session = session is None
    db = session or get_session()
    try:
        submission, correction = get_submission_for_correction(essay_correction_id, db)
        try:
            prompt = load_prompt_file("essay_study")
        except PromptLoadError as exc:
            raise EssayStudyPromptError(str(exc)) from exc

        study_session = EssayStudySession(
            essay_submission_id=submission.id or 0,
            essay_correction_id=correction.id or 0,
            provider=correction.provider,
            model=correction.model,
            prompt_name=prompt.name,
            prompt_hash=prompt.sha256,
            status="active",
            tokens_total=0,
        )
        db.add(study_session)
        db.commit()
        db.refresh(study_session)

        _append_message(db, study_session.id or 0, "system", prompt.text)
        _append_message(db, study_session.id or 0, "system", _render_correction_snapshot(correction.id or 0, db))
        _refresh_session_tokens(db, study_session)

        if study_session.tokens_total >= _study_token_limit():
            study_session = _mark_token_limit_reached(db, study_session)

        messages = list(
            db.exec(
                select(EssayStudyMessage).where(EssayStudyMessage.session_id == study_session.id).order_by(EssayStudyMessage.created_at.asc())
            )
        )
        return _to_session_response(study_session, messages)
    finally:
        if own_session:
            db.close()


def get_study_session(session_id: int, session: Session | None = None) -> EssayStudySessionResponse:
    own_session = session is None
    db = session or get_session()
    try:
        study_session = db.get(EssayStudySession, session_id)
        if study_session is None:
            raise EssayStudyError("Sessao de estudo de redacao nao encontrada.")

        messages = list(
            db.exec(
                select(EssayStudyMessage).where(EssayStudyMessage.session_id == session_id).order_by(EssayStudyMessage.created_at.asc())
            )
        )
        return _to_session_response(study_session, messages)
    finally:
        if own_session:
            db.close()


def list_study_sessions_for_submission(submission_id: int, session: Session | None = None) -> list[EssayStudySessionListItem]:
    own_session = session is None
    db = session or get_session()
    try:
        study_sessions = list(
            db.exec(
                select(EssayStudySession)
                .where(EssayStudySession.essay_submission_id == submission_id)
                .order_by(EssayStudySession.started_at.desc())
            )
        )
        return [
            EssayStudySessionListItem(
                id=item.id or 0,
                essay_submission_id=item.essay_submission_id,
                essay_correction_id=item.essay_correction_id,
                status=item.status,  # type: ignore[arg-type]
                tokens_total=item.tokens_total,
                started_at=item.started_at.isoformat(),
                ended_at=item.ended_at.isoformat() if item.ended_at else None,
            )
            for item in study_sessions
        ]
    finally:
        if own_session:
            db.close()


def create_study_message(session_id: int, content: str, session: Session | None = None) -> EssayStudySessionResponse:
    own_session = session is None
    db = session or get_session()
    try:
        study_session = db.get(EssayStudySession, session_id)
        if study_session is None:
            raise EssayStudyError("Sessao de estudo de redacao nao encontrada.")
        _ensure_active_session(study_session)

        user_content = content.strip()
        if not user_content:
            raise EssayStudyError("A mensagem do estudo nao pode ficar vazia.")

        _append_message(db, session_id, "user", user_content)
        study_session = _refresh_session_tokens(db, study_session)
        if study_session.tokens_total >= _study_token_limit():
            study_session = _mark_token_limit_reached(db, study_session)
            messages = list(
                db.exec(
                    select(EssayStudyMessage).where(EssayStudyMessage.session_id == session_id).order_by(EssayStudyMessage.created_at.asc())
                )
            )
            return _to_session_response(study_session, messages)

        history = list(
            db.exec(
                select(EssayStudyMessage).where(EssayStudyMessage.session_id == session_id).order_by(EssayStudyMessage.created_at.asc())
            )
        )
        llm_messages = [LMStudioMessage(role=item.role, content=item.content) for item in history]
        if estimate_messages_tokens(llm_messages) >= _study_token_limit():
            study_session = _mark_token_limit_reached(db, study_session)
            return _to_session_response(study_session, history)

        try:
            result = run_chat_messages(task_name="essay_study_chat", messages=llm_messages, temperature=0.2)
        except LLMTaskTimeoutError as exc:
            raise EssayStudyTimeoutError(
                "A resposta do estudo de redacao demorou mais do que o esperado no provider local."
            ) from exc
        except LLMTaskConnectionError as exc:
            raise EssayStudyUnavailableError(
                "O LM Studio parece offline ou inacessivel no momento. Verifique se o servidor local esta ativo."
            ) from exc
        except LLMTaskResponseError as exc:
            raise EssayStudyInvalidResponseError(
                "O modelo respondeu, mas a saida nao veio em formato utilizavel para o estudo da redacao."
            ) from exc

        _append_message(db, session_id, "assistant", result.output_text, tokens_estimated=result.tokens_output)
        study_session = _refresh_session_tokens(db, study_session)
        if study_session.tokens_total >= _study_token_limit():
            study_session = _mark_token_limit_reached(db, study_session)

        messages = list(
            db.exec(
                select(EssayStudyMessage).where(EssayStudyMessage.session_id == session_id).order_by(EssayStudyMessage.created_at.asc())
            )
        )
        return _to_session_response(study_session, messages)
    finally:
        if own_session:
            db.close()


def close_study_session(session_id: int, session: Session | None = None) -> EssayStudySessionCloseResponse:
    own_session = session is None
    db = session or get_session()
    try:
        study_session = db.get(EssayStudySession, session_id)
        if study_session is None:
            raise EssayStudyError("Sessao de estudo de redacao nao encontrada.")
        if study_session.status == "active":
            study_session.status = "closed"
            study_session.ended_at = datetime.utcnow()
            db.add(study_session)
            db.commit()
            db.refresh(study_session)
        elif study_session.ended_at is None:
            study_session.ended_at = datetime.utcnow()
            db.add(study_session)
            db.commit()
            db.refresh(study_session)

        return EssayStudySessionCloseResponse(
            id=study_session.id or 0,
            status=study_session.status,  # type: ignore[arg-type]
            ended_at=(study_session.ended_at or datetime.utcnow()).isoformat(),
        )
    finally:
        if own_session:
            db.close()
