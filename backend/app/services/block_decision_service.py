from __future__ import annotations

from datetime import date

from sqlmodel import Session, select

from app.core.rules import (
    BLOCK_DECISION_ADVANCE_NEXT,
    BLOCK_DECISION_CONTINUE_CURRENT,
    BLOCK_DECISION_MIXED_TRANSITION,
    BLOCK_STATUS_ACTIVE,
    BLOCK_STATUS_READY_TO_ADVANCE,
    BLOCK_STATUS_REVIEWABLE,
    BLOCK_STATUS_TRANSITION,
    normalize_block_decision,
    normalize_discipline_name,
)
from app.models import Block, BlockProgress
from app.schemas import BlockProgressDecisionRequest, BlockProgressDecisionResponse
from app.services.progression_service import _ensure_block_progress_columns, sync_progression


class BlockDecisionError(ValueError):
    pass


def _message_for_decision(decision: str) -> str:
    if decision == BLOCK_DECISION_MIXED_TRANSITION:
        return "Transicao ativada entre o bloco atual e o proximo."
    if decision == BLOCK_DECISION_ADVANCE_NEXT:
        return "Avanco aplicado. O proximo bloco virou foco principal."
    return "Foco mantido no bloco atual."


def _next_block_for_discipline(session: Session, block: Block) -> Block | None:
    return session.exec(
        select(Block)
        .where(Block.disciplina == block.disciplina)
        .where(Block.ordem > block.ordem)
        .order_by(Block.ordem, Block.id)
    ).first()


def save_block_progress_decision(
    session: Session,
    payload: BlockProgressDecisionRequest,
) -> BlockProgressDecisionResponse:
    _ensure_block_progress_columns(session)
    requested_discipline = normalize_discipline_name(payload.discipline)

    block = session.get(Block, payload.block_id)
    if block is None:
        raise BlockDecisionError("Bloco nao encontrado.")
    if normalize_discipline_name(block.disciplina) != requested_discipline:
        raise BlockDecisionError("O bloco informado nao pertence a disciplina enviada.")

    today = date.today()
    block_progress_map, _ = sync_progression(session, today, discipline_filter=block.disciplina)
    progress = block_progress_map.get(payload.block_id)
    if progress is None:
        raise BlockDecisionError("Nao foi possivel localizar a progressao do bloco informado.")

    valid_focus_statuses = {BLOCK_STATUS_ACTIVE, BLOCK_STATUS_READY_TO_ADVANCE, BLOCK_STATUS_TRANSITION}
    if progress.status not in valid_focus_statuses:
        raise BlockDecisionError("A decisao so pode ser aplicada a um bloco em foco pedagogico.")

    next_block = _next_block_for_discipline(session, block)
    saved_decision = normalize_block_decision(payload.user_decision)

    if saved_decision in {BLOCK_DECISION_MIXED_TRANSITION, BLOCK_DECISION_ADVANCE_NEXT}:
        if progress.status != BLOCK_STATUS_READY_TO_ADVANCE:
            raise BlockDecisionError("Essa decisao exige que o bloco esteja pronto para avancar.")
        if next_block is None:
            raise BlockDecisionError("Nao existe proximo bloco disponivel na disciplina para aplicar essa decisao.")

    progress.user_decision = saved_decision
    session.add(progress)
    session.commit()

    updated_block_progress, _ = sync_progression(session, today, discipline_filter=block.disciplina)
    updated_progress = updated_block_progress.get(payload.block_id)
    if updated_progress is None:
        raise BlockDecisionError("Nao foi possivel recalcular a progressao do bloco informado.")

    relevant_next_block = next_block
    if saved_decision == BLOCK_DECISION_ADVANCE_NEXT and next_block is not None:
        relevant_next_block = next_block

    return BlockProgressDecisionResponse(
        discipline=block.disciplina,
        block_id=payload.block_id,
        saved_decision=saved_decision,
        current_status=updated_progress.status,
        next_block_id=relevant_next_block.id if relevant_next_block and relevant_next_block.id is not None else None,
        message=_message_for_decision(saved_decision),
    )
