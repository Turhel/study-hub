from __future__ import annotations

from datetime import date, timedelta

from sqlmodel import Session, select

from app.models import QuestionAttempt, Review


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

    review.ultima_data = attempt.data
    review.proxima_data = next_date
    review.status = "pendente"
    review.resultado = "acerto" if attempt.acertou else "erro"
    review.intervalo_dias = interval_days

    session.add(review)
    return review
