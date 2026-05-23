from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlmodel import Session, select

from app.models import Block, BlockSubject, MockExamQuestion, QuestionAttempt, Review, Subject
from app.services.study_event_service import record_study_event


ADVANCED_REVIEW_STAGES = {"R2", "R3", "R4", "R5", "R6", "R7"}
ADVANCED_REVIEW_QUESTION_TARGET = 7


@dataclass(frozen=True)
class R1TribunalQuestion:
    question_id: int | None
    attempt_id: int | None
    subject_id: int | None
    source: str
    prompt_markdown: str | None = None
    notes: str | None = None


@dataclass(frozen=True)
class R1TribunalSession:
    block_id: int
    mode: str
    questions: list[R1TribunalQuestion]


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


def review_question_target_for_stage(stage: str | None) -> int:
    return ADVANCED_REVIEW_QUESTION_TARGET if (stage or "").upper() in ADVANCED_REVIEW_STAGES else 5


def generate_r1_tribunal_session(session: Session, block_id: int, user_id: int = 1) -> R1TribunalSession:
    del user_id  # O ecossistema local ainda usa usuario unico.

    saved_failures = session.exec(
        select(MockExamQuestion)
        .where(MockExamQuestion.block_id == block_id)
        .where(MockExamQuestion.source_type == "saved_bank")
        .where(MockExamQuestion.is_correct == False)  # noqa: E712
        .order_by(MockExamQuestion.answered_at.desc(), MockExamQuestion.id.desc())
    ).all()
    if saved_failures:
        return R1TribunalSession(
            block_id=block_id,
            mode="tribunal",
            questions=[
                R1TribunalQuestion(
                    question_id=question.id,
                    attempt_id=None,
                    subject_id=question.subject_id,
                    source="saved_bank",
                    prompt_markdown=question.prompt_markdown,
                    notes=question.notes,
                )
                for question in saved_failures
            ],
        )

    failed_attempts = session.exec(
        select(QuestionAttempt)
        .where(QuestionAttempt.block_id == block_id)
        .where(QuestionAttempt.acertou == False)  # noqa: E712
        .order_by(QuestionAttempt.data.desc(), QuestionAttempt.id.desc())
    ).all()
    if failed_attempts:
        return R1TribunalSession(
            block_id=block_id,
            mode="tribunal",
            questions=[
                R1TribunalQuestion(
                    question_id=None,
                    attempt_id=attempt.id,
                    subject_id=attempt.subject_id,
                    source=attempt.source or "question_attempt",
                    notes=attempt.observacoes,
                )
                for attempt in failed_attempts
            ],
        )

    subject_ids = [
        row.subject_id
        for row in session.exec(select(BlockSubject).where(BlockSubject.block_id == block_id)).all()
    ]
    light_query = (
        select(MockExamQuestion)
        .where(MockExamQuestion.block_id == block_id)
        .where(MockExamQuestion.source_type != "saved_bank")
        .order_by(MockExamQuestion.id.desc())
        .limit(5)
    )
    light_questions = session.exec(light_query).all()
    if not light_questions and subject_ids:
        light_questions = session.exec(
            select(MockExamQuestion)
            .where(MockExamQuestion.subject_id.in_(subject_ids))
            .where(MockExamQuestion.source_type != "saved_bank")
            .order_by(MockExamQuestion.id.desc())
            .limit(5)
        ).all()

    return R1TribunalSession(
        block_id=block_id,
        mode="r1_light",
        questions=[
            R1TribunalQuestion(
                question_id=question.id,
                attempt_id=None,
                subject_id=question.subject_id,
                source=question.source_type,
                prompt_markdown=question.prompt_markdown,
                notes=question.notes,
            )
            for question in light_questions
        ],
    )


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
