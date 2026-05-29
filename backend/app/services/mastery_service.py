from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlmodel import Session, select

from app.core.rules import STATUS_EM_RISCO, score_dominio, status_aprovacao_bloco
from app.models import Block, BlockMastery, MockExamQuestion, QuestionAttempt, Review


EAERE_REVIEW_STAGES = ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]
ADVANCED_REVIEW_BASE_INTERVAL_DAYS = 60
ADVANCED_REVIEW_ELASTIC_MULTIPLIER = 1.5


def _difficulty_from_peer_accuracy(value: float | None) -> str | None:
    if value is None:
        return None
    if value >= 65:
        return "facil"
    if value >= 45:
        return "media"
    return "dificil"


def _attempt_accuracy(attempts: list[QuestionAttempt]) -> float | None:
    if not attempts:
        return None
    return sum(1 for attempt in attempts if attempt.acertou) / len(attempts)


def _stage_is_new_content(stage: str) -> bool:
    normalized = stage.upper()
    return normalized in {"E1", "E2", "A1"} or normalized.startswith("EX")


def _ex_stage_from_batch_count(batch_count: int) -> str:
    return f"EX{max(batch_count, 1)}"


def _recent_attempt_batches(session: Session, block_id: int) -> list[list[QuestionAttempt]]:
    attempts = session.exec(
        select(QuestionAttempt)
        .where(QuestionAttempt.block_id == block_id)
        .order_by(QuestionAttempt.data.desc(), QuestionAttempt.id.desc())
    ).all()
    batches: dict[tuple[date, str], list[QuestionAttempt]] = defaultdict(list)
    for attempt in attempts:
        source = attempt.source or f"attempt-{attempt.id or 0}"
        batches[(attempt.data, source)].append(attempt)

    ordered_keys = sorted(
        batches,
        key=lambda key: max((attempt.id or 0) for attempt in batches[key]),
        reverse=True,
    )
    return [batches[key] for key in ordered_keys]


def _advance_review_stage(stage: str) -> str:
    normalized = stage.upper()
    if normalized not in EAERE_REVIEW_STAGES:
        return normalized
    index = EAERE_REVIEW_STAGES.index(normalized)
    return EAERE_REVIEW_STAGES[min(index + 1, len(EAERE_REVIEW_STAGES) - 1)]


def _regress_review_stage(stage: str) -> str:
    normalized = stage.upper()
    if normalized not in EAERE_REVIEW_STAGES:
        return normalized
    index = EAERE_REVIEW_STAGES.index(normalized)
    return EAERE_REVIEW_STAGES[max(index - 1, 0)]


def _new_content_exhausted_for_discipline(session: Session, block_id: int) -> bool:
    block = session.get(Block, block_id)
    if block is None:
        return False

    discipline_blocks = session.exec(select(Block).where(Block.disciplina == block.disciplina)).all()
    if not discipline_blocks:
        return False

    block_ids = [item.id for item in discipline_blocks if item.id is not None]
    if not block_ids:
        return False

    mastery_rows = session.exec(select(BlockMastery).where(BlockMastery.block_id.in_(block_ids))).all()
    mastery_by_block_id = {row.block_id: (row.eaere_stage or "E1").upper() for row in mastery_rows}
    for candidate_block_id in block_ids:
        if _stage_is_new_content(mastery_by_block_id.get(candidate_block_id, "E1")):
            return False
    return True


def _schedule_elastic_long_term_review(
    session: Session,
    *,
    block_id: int,
    attempts: list[QuestionAttempt],
) -> None:
    next_interval = round(ADVANCED_REVIEW_BASE_INTERVAL_DAYS * ADVANCED_REVIEW_ELASTIC_MULTIPLIER)
    next_date = date.today() + timedelta(days=next_interval)
    existing = session.exec(
        select(Review)
        .where(Review.block_id == block_id)
        .where(Review.status == "pendente")
        .order_by(Review.proxima_data.desc(), Review.id.desc())
    ).first()
    new_content_exhausted = _new_content_exhausted_for_discipline(session, block_id)

    if existing is None:
        session.add(
            Review(
                block_id=block_id,
                subject_id=attempts[-1].subject_id if attempts else None,
                ultima_data=date.today(),
                proxima_data=next_date,
                status="pendente",
                resultado="elastic_long_term",
                intervalo_dias=next_interval,
            )
        )
        return

    existing_interval = existing.intervalo_dias or 1
    if existing_interval > next_interval and not new_content_exhausted:
        return

    existing.ultima_data = date.today()
    existing.proxima_data = next_date
    existing.resultado = "elastic_long_term"
    existing.intervalo_dias = next_interval
    session.add(existing)


def _schedule_rr_satellite(
    session: Session,
    *,
    block_id: int,
    stage: str,
    attempts: list[QuestionAttempt],
) -> None:
    failed_attempts = [attempt for attempt in attempts if not attempt.acertou]
    if not failed_attempts:
        return

    rr_stage = f"RR{stage.lstrip('R')}"
    next_day = date.today() + timedelta(days=1)
    existing = session.exec(
        select(Review)
        .where(Review.block_id == block_id)
        .where(Review.proxima_data == next_day)
        .where(Review.resultado == rr_stage)
    ).first()
    if existing is not None:
        return

    session.add(
        Review(
            block_id=block_id,
            subject_id=failed_attempts[-1].subject_id,
            ultima_data=date.today(),
            proxima_data=next_day,
            status="pendente",
            resultado=rr_stage,
            intervalo_dias=1,
        )
    )


def _apply_eaere_transition(
    session: Session,
    mastery: BlockMastery,
    block_id: int,
    current_attempts: list[QuestionAttempt] | None,
) -> None:
    if not current_attempts:
        return

    current_accuracy = _attempt_accuracy(current_attempts)
    if current_accuracy is None:
        return

    stage = (mastery.eaere_stage or "E1").upper()

    if stage == "E1":
        if len(current_attempts) < 5:
            mastery.status = "em_andamento"
            return
        mastery.eaere_stage = "E2"
        mastery.status = "em_andamento"
        return

    if stage == "E2":
        all_attempts = session.exec(
            select(QuestionAttempt).where(QuestionAttempt.block_id == block_id)
        ).all()
        combined_accuracy = _attempt_accuracy(all_attempts) or 0.0
        if combined_accuracy >= 0.85:
            mastery.eaere_stage = "R1"
            mastery.status = "aprovado"
            mastery.consecutive_failures = 0
        else:
            mastery.eaere_stage = "EX1"
            mastery.status = STATUS_EM_RISCO
        return

    if stage.startswith("EX"):
        batches = _recent_attempt_batches(session, block_id)
        batch_accuracies = [
            accuracy
            for batch in batches[:3]
            if (accuracy := _attempt_accuracy(batch)) is not None
        ]
        if batch_accuracies:
            moving_average = sum(batch_accuracies) / len(batch_accuracies)
            mastery.ex_moving_average = round(moving_average, 4)
            if len(batch_accuracies) >= 3 and moving_average >= 0.85:
                mastery.eaere_stage = "R1"
                mastery.status = "aprovado"
                mastery.consecutive_failures = 0
                return
        mastery.eaere_stage = _ex_stage_from_batch_count(len(batches))
        mastery.status = STATUS_EM_RISCO
        return

    if stage in {"R2", "R3", "R4", "R5", "R6", "R7"} and any(not attempt.acertou for attempt in current_attempts):
        _schedule_rr_satellite(session, block_id=block_id, stage=stage, attempts=current_attempts)

    if stage in {"R4", "R5"} and current_accuracy < 0.75:
        if mastery.consecutive_failures <= 0:
            mastery.consecutive_failures = 1
        else:
            mastery.consecutive_failures = 0
            mastery.eaere_stage = _regress_review_stage(stage)
        mastery.status = STATUS_EM_RISCO
        return

    if stage in EAERE_REVIEW_STAGES and current_accuracy >= 0.85:
        mastery.consecutive_failures = 0
        if stage in {"R6", "R7"}:
            _schedule_elastic_long_term_review(session, block_id=block_id, attempts=current_attempts)
        mastery.eaere_stage = _advance_review_stage(stage)
        mastery.status = "aprovado"


def recalculate_block_mastery(
    session: Session,
    block_id: int,
    current_attempts: list[QuestionAttempt] | None = None,
) -> BlockMastery:
    attempts = session.exec(
        select(QuestionAttempt).where(QuestionAttempt.block_id == block_id)
    ).all()

    totals: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "acertos": 0})
    for attempt in attempts:
        difficulty = attempt.dificuldade_banco
        totals[difficulty]["total"] += 1
        totals[difficulty]["acertos"] += int(attempt.acertou)

    saved_questions = session.exec(
        select(MockExamQuestion).where(
            MockExamQuestion.block_id == block_id,
            MockExamQuestion.source_type == "saved_bank",
        )
    ).all()
    has_easy_miss = False
    has_hard_hit = False
    for question in saved_questions:
        difficulty = _difficulty_from_peer_accuracy(question.difficulty_percent)
        if difficulty is None:
            continue
        totals[difficulty]["total"] += 1
        totals[difficulty]["acertos"] += int(question.is_correct is True)
        if difficulty == "facil" and question.is_correct is False:
            has_easy_miss = True
        if difficulty == "dificil" and question.is_correct is True:
            has_hard_hit = True

    facil_total = totals["facil"]["total"]
    facil_acertos = totals["facil"]["acertos"]
    media_total = totals["media"]["total"]
    media_acertos = totals["media"]["acertos"]
    dificil_total = totals["dificil"]["total"]
    dificil_acertos = totals["dificil"]["acertos"]

    status = status_aprovacao_bloco(
        facil_total,
        facil_acertos,
        media_total,
        media_acertos,
        dificil_total,
        dificil_acertos,
    )
    score = score_dominio(
        facil_total,
        facil_acertos,
        media_total,
        media_acertos,
        dificil_total,
        dificil_acertos,
    )
    has_tri_incoherence = has_easy_miss and has_hard_hit
    if has_tri_incoherence:
        score = round(score * 0.85, 4)
        status = STATUS_EM_RISCO

    mastery = session.exec(
        select(BlockMastery).where(BlockMastery.block_id == block_id)
    ).first()
    if mastery is None:
        mastery = BlockMastery(block_id=block_id)

    mastery.facil_total = facil_total
    mastery.facil_acertos = facil_acertos
    mastery.media_total = media_total
    mastery.media_acertos = media_acertos
    mastery.dificil_total = dificil_total
    mastery.dificil_acertos = dificil_acertos
    mastery.status = status
    mastery.score_domino = score
    _apply_eaere_transition(session, mastery, block_id, current_attempts)

    block = session.get(Block, block_id)
    if block is not None:
        block.status = status
        session.add(block)

    session.add(mastery)
    return mastery
