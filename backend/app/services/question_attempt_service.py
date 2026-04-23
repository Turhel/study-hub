from __future__ import annotations

from datetime import date

from sqlmodel import Session

from app.models import Block, QuestionAttempt, Subject
from app.schemas import QuestionAttemptBulkCreate, QuestionAttemptBulkCreateResponse
from app.services.mastery_service import recalculate_block_mastery
from app.services.review_service import upsert_review_from_attempt
from app.services.study_event_service import record_study_event


VALID_DIFFICULTIES = {"facil", "media", "dificil"}


def _parse_date(value: str | None) -> date:
    if value is None:
        return date.today()
    return date.fromisoformat(value)


def _difficulty(value: str | None, default: str = "media") -> str:
    normalized = (value or default).strip().lower()
    if normalized not in VALID_DIFFICULTIES:
        return default
    return normalized


def _confidence_value(value: str | None) -> int | None:
    normalized = (value or "").strip().lower()
    if normalized == "baixa":
        return 2
    if normalized == "media":
        return 3
    if normalized == "alta":
        return 5
    return None


def _impact_message(status: str | None, score: float | None) -> str:
    if status == "aprovado":
        return "Bloco aprovado. Bom avanco na trilha."
    if status == "em_risco":
        return "Assunto ainda precisa de reforco."
    if score is not None and score >= 0.55:
        return "Bom progresso no pre-requisito central."
    return "Bloco avancou, mas ainda nao foi aprovado."


def _subject_label(subject: Subject) -> str:
    if subject.subassunto:
        return f"{subject.assunto} - {subject.subassunto}"
    return subject.assunto


def register_question_attempts_bulk(
    session: Session,
    payload: QuestionAttemptBulkCreate,
) -> QuestionAttemptBulkCreateResponse:
    block = session.get(Block, payload.block_id)
    subject = session.get(Subject, payload.subject_id)
    if block is None:
        raise ValueError("Bloco nao encontrado.")
    if subject is None:
        raise ValueError("Assunto nao encontrado.")
    if payload.quantity < 1:
        raise ValueError("A quantidade deve ser maior que zero.")
    if payload.correct_count < 0 or payload.correct_count > payload.quantity:
        raise ValueError("Acertos deve ficar entre zero e a quantidade feita.")

    attempt_date = _parse_date(payload.date)
    difficulty_bank = _difficulty(payload.difficulty_bank)
    difficulty_personal = _difficulty(payload.difficulty_personal, default=difficulty_bank)
    confidence = _confidence_value(payload.confidence)
    created_attempts: list[QuestionAttempt] = []

    for index in range(payload.quantity):
        attempt = QuestionAttempt(
            data=attempt_date,
            source=payload.source,
            disciplina=payload.discipline,
            block_id=payload.block_id,
            subject_id=payload.subject_id,
            dificuldade_banco=difficulty_bank,
            dificuldade_pessoal=difficulty_personal,
            acertou=index < payload.correct_count,
            tempo_segundos=payload.elapsed_seconds,
            confianca=confidence,
            tipo_erro=None if index < payload.correct_count else payload.error_type,
            observacoes=payload.notes,
        )
        session.add(attempt)
        created_attempts.append(attempt)

    session.flush()
    for attempt in created_attempts:
        session.refresh(attempt)

    mastery = recalculate_block_mastery(session, payload.block_id)
    review = upsert_review_from_attempt(session, created_attempts[-1])
    subject_name = _subject_label(subject)
    correct_count = payload.correct_count
    record_study_event(
        session,
        event_type="question_attempt_bulk",
        title=f"Questoes registradas em {payload.discipline}",
        description=f"{payload.quantity} tentativas registradas em {block.nome} - {subject_name}.",
        discipline=payload.discipline,
        block_id=payload.block_id,
        subject_id=payload.subject_id,
        metadata={
            "created_attempts": len(created_attempts),
            "correct_count": correct_count,
            "incorrect_count": payload.quantity - correct_count,
            "attempt_date": attempt_date.isoformat(),
            "difficulty_bank": difficulty_bank,
            "difficulty_personal": difficulty_personal,
            "source": payload.source,
            "mastery_status": mastery.status,
            "mastery_score": mastery.score_domino,
            "next_review_date": review.proxima_data.isoformat() if review is not None else None,
            "attempt_ids": [attempt.id for attempt in created_attempts],
        },
    )
    session.commit()
    session.refresh(mastery)

    return QuestionAttemptBulkCreateResponse(
        created_attempts=len(created_attempts),
        block_id=payload.block_id,
        subject_id=payload.subject_id,
        mastery_status=mastery.status,
        mastery_score=mastery.score_domino,
        next_review_date=review.proxima_data.isoformat() if review is not None else None,
        impact_message=_impact_message(mastery.status, mastery.score_domino),
    )
