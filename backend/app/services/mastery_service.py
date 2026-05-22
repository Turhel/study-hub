from __future__ import annotations

from collections import defaultdict

from sqlmodel import Session, select

from app.core.rules import STATUS_EM_RISCO, score_dominio, status_aprovacao_bloco
from app.models import Block, BlockMastery, MockExamQuestion, QuestionAttempt


def _difficulty_from_peer_accuracy(value: float | None) -> str | None:
    if value is None:
        return None
    if value >= 65:
        return "facil"
    if value >= 45:
        return "media"
    return "dificil"


def recalculate_block_mastery(session: Session, block_id: int) -> BlockMastery:
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

    block = session.get(Block, block_id)
    if block is not None:
        block.status = status
        session.add(block)

    session.add(mastery)
    return mastery
