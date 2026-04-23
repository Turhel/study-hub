from __future__ import annotations

from datetime import date, timedelta

from sqlmodel import Session, select

from app.models import Block, QuestionAttempt, Review, Subject
from app.services.study_event_service import record_study_event


def _subject_label(subject: Subject | None, subject_id: int | None) -> str:
    if subject is None:
        return f"Assunto {subject_id}" if subject_id is not None else "Assunto nao identificado"
    if subject.subassunto:
        return f"{subject.assunto} - {subject.subassunto}"
    return subject.assunto


def _block_label(block: Block | None, block_id: int | None) -> str:
    if block is None:
        return f"Bloco {block_id}" if block_id is not None else "Bloco nao identificado"
    return block.nome


def review_interval_days(acertou: bool, confianca: int | None) -> int:
    if not acertou:
        return 1
    if confianca is not None and confianca >= 5:
        return 7
    return 3


def upsert_review_from_attempt(session: Session, attempt: QuestionAttempt) -> Review | None:
    if attempt.subject_id is None:
        return None

    interval_days = review_interval_days(attempt.acertou, attempt.confianca)
    next_date = date.today() + timedelta(days=interval_days)

    review = session.exec(
        select(Review)
        .where(Review.subject_id == attempt.subject_id)
        .where(Review.block_id == attempt.block_id)
        .where(Review.status == "pendente")
    ).first()

    if review is None:
        review = Review(
            subject_id=attempt.subject_id,
            block_id=attempt.block_id,
            proxima_data=next_date,
        )
        action = "created"
    else:
        action = "updated"

    review.ultima_data = attempt.data
    review.proxima_data = next_date
    review.status = "pendente"
    review.resultado = "acerto" if attempt.acertou else "erro"
    review.intervalo_dias = interval_days

    session.add(review)
    session.flush()

    subject = session.get(Subject, attempt.subject_id)
    block = session.get(Block, attempt.block_id) if attempt.block_id is not None else None
    subject_name = _subject_label(subject, attempt.subject_id)
    block_name = _block_label(block, attempt.block_id)
    discipline = subject.disciplina if subject is not None else attempt.disciplina
    record_study_event(
        session,
        event_type="review_upsert",
        title=f"Revisao {'criada' if action == 'created' else 'atualizada'} para {subject_name}",
        description=f"Revisao de {block_name} programada para {next_date.isoformat()}.",
        discipline=discipline,
        block_id=attempt.block_id,
        subject_id=attempt.subject_id,
        metadata={
            "review_id": review.id,
            "action": action,
            "status": review.status,
            "result": review.resultado,
            "interval_days": interval_days,
            "next_review_date": next_date.isoformat(),
            "attempt_id": attempt.id,
        },
    )
    return review
