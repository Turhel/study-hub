from __future__ import annotations

from datetime import date

from sqlmodel import Session, select

from app.core.rules import (
    BLOCK_STATUS_ACTIVE,
    BLOCK_STATUS_READY_TO_ADVANCE,
    BLOCK_STATUS_TRANSITION,
    block_is_focus_status,
    discipline_priority,
    FORGOTTEN_CONTACT_THRESHOLD_DAYS,
    FORGOTTEN_GRACE_DAYS,
)
from app.models import Block, BlockMastery, BlockProgress, BlockSubject, Review, Subject, SubjectProgress
from app.schemas import (
    TodayForgottenSubjectItem,
    TodayMetrics,
    TodayPriority,
    TodayResponse,
    TodayReviewItem,
    TodayRiskBlockItem,
    TodayStartingPointItem,
)
from app.services.progression_service import sync_progression


def _subject_label(subject: Subject | None) -> str:
    if subject is None:
        return "Assunto nao informado"
    if subject.subassunto:
        return f"{subject.assunto} - {subject.subassunto}"
    return subject.assunto


def _due_reviews(session: Session, today: date) -> list[TodayReviewItem]:
    reviews = session.exec(
        select(Review)
        .where(Review.status == "pendente")
        .where(Review.proxima_data <= today)
        .order_by(Review.proxima_data)
    ).all()

    items: list[TodayReviewItem] = []
    for review in reviews:
        subject = session.get(Subject, review.subject_id) if review.subject_id else None
        block = session.get(Block, review.block_id) if review.block_id else None
        subject_name = _subject_label(subject)
        block_name = block.nome if block else None
        items.append(
            TodayReviewItem(
                id=review.id or 0,
                subject=subject_name,
                block=block_name,
                due_date=review.proxima_data.isoformat(),
                title=subject_name,
                description=f"Venceu em {review.proxima_data.isoformat()}",
            )
        )

    return items


def _risk_blocks(session: Session, block_progress: dict[int, BlockProgress]) -> list[TodayRiskBlockItem]:
    masteries = session.exec(
        select(BlockMastery)
        .where(BlockMastery.status != "aprovado")
        .order_by(BlockMastery.score_domino)
    ).all()

    items: list[TodayRiskBlockItem] = []
    for mastery in masteries:
        progress = block_progress.get(mastery.block_id)
        if progress is None or not block_is_focus_status(progress.status):
            continue

        block = session.get(Block, mastery.block_id)
        name = block.nome if block else f"Bloco {mastery.block_id}"
        discipline = block.disciplina if block else None
        items.append(
            TodayRiskBlockItem(
                id=mastery.id or 0,
                name=name,
                discipline=discipline,
                score=mastery.score_domino,
                status=mastery.status,
                title=name,
                description=f"Score {mastery.score_domino:.0%} · {mastery.status}",
            )
        )

    return items[:5]


def _forgotten_subjects(
    session: Session,
    today: date,
    subject_progress: dict[int, SubjectProgress],
) -> list[TodayForgottenSubjectItem]:
    subjects = session.exec(
        select(Subject)
        .where(Subject.ativo == True)  # noqa: E712
        .order_by(Subject.disciplina, Subject.assunto)
    ).all()
    forgotten: list[TodayForgottenSubjectItem] = []

    for subject in subjects:
        if subject.id is None:
            continue

        progress = subject_progress.get(subject.id)
        if progress is None or progress.status not in {"available", "in_progress", "reviewing"}:
            continue
        if progress.unlocked_at is None:
            continue

        is_seen = progress.first_seen_at is not None
        grace_ended = (today - progress.unlocked_at).days >= FORGOTTEN_GRACE_DAYS
        if not is_seen and not grace_ended:
            continue

        if progress.last_seen_at is not None:
            days_without_contact = (today - progress.last_seen_at).days
        else:
            days_without_contact = (today - progress.unlocked_at).days

        if days_without_contact < FORGOTTEN_CONTACT_THRESHOLD_DAYS:
            continue

        subject_name = _subject_label(subject)
        description = (
            f"Desbloqueado ha {days_without_contact} dias e ainda nao visto"
            if not is_seen
            else f"{days_without_contact} dias sem contato"
        )
        forgotten.append(
            TodayForgottenSubjectItem(
                id=subject.id or 0,
                subject=subject_name,
                discipline=subject.disciplina,
                days_without_contact=days_without_contact,
                title=subject_name,
                description=description,
            )
        )

    return sorted(
        forgotten,
        key=lambda item: item.days_without_contact,
        reverse=True,
    )[:5]


def _starting_points(
    session: Session,
    block_progress: dict[int, BlockProgress],
) -> list[TodayStartingPointItem]:
    available_blocks = []
    for block in session.exec(select(Block).order_by(Block.disciplina, Block.ordem, Block.id)).all():
        if block.id is None:
            continue
        progress = block_progress.get(block.id)
        if progress is None or progress.status not in {BLOCK_STATUS_ACTIVE, BLOCK_STATUS_READY_TO_ADVANCE, BLOCK_STATUS_TRANSITION}:
            continue
        available_blocks.append(block)

    ordered_blocks = sorted(
        available_blocks,
        key=lambda block: (discipline_priority(block.disciplina), block.ordem, block.id or 0),
    )

    starting_points: list[TodayStartingPointItem] = []
    for block in ordered_blocks:
        if block.id is None:
            continue

        link = session.exec(
            select(BlockSubject)
            .where(BlockSubject.block_id == block.id)
            .order_by(BlockSubject.id)
        ).first()
        if link is None:
            continue

        subject = session.get(Subject, link.subject_id)
        if subject is None or subject.id is None:
            continue

        subject_name = _subject_label(subject)
        starting_points.append(
            TodayStartingPointItem(
                discipline=block.disciplina,
                block_id=block.id,
                block_name=block.nome,
                subject_id=subject.id,
                subject_name=subject_name,
                reason="Primeiro bloco acessivel da trilha atual da disciplina prioritaria",
                title=f"{block.disciplina} - {block.nome}",
                description=subject_name,
            )
        )

    return starting_points[:5]


def _priority(
    due_reviews: list[TodayReviewItem],
    risk_blocks: list[TodayRiskBlockItem],
    forgotten_subjects: list[TodayForgottenSubjectItem],
    starting_points: list[TodayStartingPointItem],
) -> TodayPriority:
    if due_reviews:
        return TodayPriority(
            title="Priorize revisões vencidas",
            description="Você tem revisões pendentes para resolver antes de avançar.",
        )
    if risk_blocks:
        return TodayPriority(
            title="Recupere um bloco em risco",
            description="Seu próximo foco deve ser reforçar um bloco com domínio insuficiente.",
        )
    if forgotten_subjects:
        return TodayPriority(
            title="Retome assuntos sem contato recente",
            description="Alguns conteúdos estão ficando frios e merecem revisão.",
        )
    if starting_points:
        first = starting_points[0]
        return TodayPriority(
            title=f"Comece por {first.discipline} - {first.block_name}",
            description=(
                f"Seu melhor ponto de partida agora é {first.subject_name}, "
                "porque este é o primeiro bloco disponível da disciplina mais prioritária."
            ),
        )

    return TodayPriority(
        title="Base pronta para começar",
        description="Registre questões e revisões para gerar prioridades mais inteligentes.",
    )


def get_today_summary(session: Session) -> TodayResponse:
    today = date.today()
    block_progress, subject_progress = sync_progression(session, today)
    blocks_count = len(session.exec(select(Block)).all())
    subjects_count = len(session.exec(select(Subject)).all())
    due_reviews = _due_reviews(session, today)
    risk_blocks = _risk_blocks(session, block_progress)
    forgotten_subjects = _forgotten_subjects(session, today, subject_progress)
    starting_points = _starting_points(session, block_progress)

    return TodayResponse(
        metrics=TodayMetrics(
            blocks=blocks_count,
            subjects=subjects_count,
            due_reviews=len(due_reviews),
            forgotten_subjects=len(forgotten_subjects),
        ),
        priority=_priority(due_reviews, risk_blocks, forgotten_subjects, starting_points),
        due_reviews=due_reviews,
        risk_blocks=risk_blocks,
        forgotten_subjects=forgotten_subjects,
        starting_points=starting_points,
    )
