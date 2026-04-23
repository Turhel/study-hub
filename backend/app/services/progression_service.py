from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from itertools import groupby

from sqlmodel import Session, select

from app.core.rules import (
    BLOCK_DECISION_ADVANCE_NEXT,
    BLOCK_DECISION_CONTINUE_CURRENT,
    BLOCK_DECISION_MIXED_TRANSITION,
    BLOCK_STATUS_ACTIVE,
    BLOCK_STATUS_FUTURE_LOCKED,
    BLOCK_STATUS_READY_TO_ADVANCE,
    BLOCK_STATUS_REVIEWABLE,
    BLOCK_STATUS_TRANSITION,
    block_is_accessible,
    block_is_focus_status,
    block_is_reviewable,
    normalize_discipline_name,
    normalize_block_decision,
    PROGRESS_AVAILABLE,
    PROGRESS_IN_PROGRESS,
    PROGRESS_MASTERED,
    PROGRESS_REVIEWING,
)
from app.models import (
    Block,
    BlockMastery,
    BlockProgress,
    BlockSubject,
    QuestionAttempt,
    Review,
    Subject,
    SubjectProgress,
)
from app.schemas import DisciplineBlockProgressItem, DisciplineBlockProgressSnapshotResponse
from app.services.roadmap_progression_service import (
    GuidedRoadmapDisciplineSummary,
    GuidedRoadmapOverview,
    get_discipline_guided_roadmap_summary,
    build_guided_roadmap_overview,
)


def _block_has_attempts(session: Session, block_id: int) -> bool:
    return session.exec(select(QuestionAttempt.id).where(QuestionAttempt.block_id == block_id)).first() is not None


def _block_mastery_by_id(session: Session) -> dict[int, BlockMastery]:
    return {
        mastery.block_id: mastery
        for mastery in session.exec(select(BlockMastery)).all()
    }


def _block_progress_by_id(session: Session) -> dict[int, BlockProgress]:
    return {
        progress.block_id: progress
        for progress in session.exec(select(BlockProgress)).all()
    }


def _subject_progress_by_id(session: Session) -> dict[int, SubjectProgress]:
    return {
        progress.subject_id: progress
        for progress in session.exec(select(SubjectProgress)).all()
    }


def _blocks_for_normalized_discipline(session: Session, discipline: str) -> list[Block]:
    normalized = normalize_discipline_name(discipline)
    blocks = session.exec(select(Block).order_by(Block.disciplina, Block.ordem, Block.id)).all()
    return [block for block in blocks if normalize_discipline_name(block.disciplina) == normalized]


def sync_block_progress(
    session: Session,
    today: date,
    discipline_filter: str | None = None,
) -> dict[int, BlockProgress]:
    blocks = session.exec(select(Block).order_by(Block.disciplina, Block.ordem, Block.id)).all()
    mastery_by_id = _block_mastery_by_id(session)
    progress_by_id = _block_progress_by_id(session)

    for discipline, discipline_blocks_iter in groupby(blocks, key=lambda block: block.disciplina):
        if discipline_filter is not None and discipline != discipline_filter:
            continue
        discipline_blocks = list(discipline_blocks_iter)
        anchor_index = 0

        for index, block in enumerate(discipline_blocks):
            if block.id is None:
                continue
            previous_status = progress_by_id.get(block.id)
            if previous_status is not None and block_is_focus_status(previous_status.status):
                anchor_index = index
                break

        anchor_block = discipline_blocks[anchor_index] if discipline_blocks else None
        anchor_progress = progress_by_id.get(anchor_block.id) if anchor_block and anchor_block.id is not None else None
        anchor_decision = normalize_block_decision(anchor_progress.user_decision if anchor_progress else None)
        anchor_mastery = mastery_by_id.get(anchor_block.id) if anchor_block and anchor_block.id is not None else None
        anchor_ready = anchor_mastery is not None and anchor_mastery.status == "aprovado"
        has_next_block = anchor_index + 1 < len(discipline_blocks)

        for index, block in enumerate(discipline_blocks):
            if block.id is None:
                continue

            mastery = mastery_by_id.get(block.id)
            is_anchor = index == anchor_index
            is_next_after_anchor = index == anchor_index + 1

            if anchor_ready and anchor_decision == BLOCK_DECISION_ADVANCE_NEXT and has_next_block:
                if index < anchor_index + 1:
                    status = BLOCK_STATUS_REVIEWABLE
                elif index == anchor_index + 1:
                    next_ready = mastery is not None and mastery.status == "aprovado"
                    status = BLOCK_STATUS_READY_TO_ADVANCE if next_ready else BLOCK_STATUS_ACTIVE
                else:
                    status = BLOCK_STATUS_FUTURE_LOCKED
            elif anchor_ready and anchor_decision == BLOCK_DECISION_MIXED_TRANSITION and has_next_block:
                if index < anchor_index:
                    status = BLOCK_STATUS_REVIEWABLE
                elif is_anchor or is_next_after_anchor:
                    status = BLOCK_STATUS_TRANSITION
                else:
                    status = BLOCK_STATUS_FUTURE_LOCKED
            else:
                if index < anchor_index:
                    status = BLOCK_STATUS_REVIEWABLE
                elif is_anchor:
                    status = BLOCK_STATUS_READY_TO_ADVANCE if anchor_ready else BLOCK_STATUS_ACTIVE
                else:
                    status = BLOCK_STATUS_FUTURE_LOCKED

            progress = progress_by_id.get(block.id)
            if progress is None:
                progress = BlockProgress(block_id=block.id)
                progress_by_id[block.id] = progress

            previous_decision = normalize_block_decision(progress.user_decision if progress.user_decision else None)
            was_unlocked = progress.unlocked_at is not None
            progress.status = status
            if status in {BLOCK_STATUS_ACTIVE, BLOCK_STATUS_READY_TO_ADVANCE, BLOCK_STATUS_TRANSITION}:
                progress.user_decision = previous_decision
            else:
                progress.user_decision = BLOCK_DECISION_CONTINUE_CURRENT

            if block_is_accessible(status) and not was_unlocked:
                progress.unlocked_at = today
            if status == BLOCK_STATUS_FUTURE_LOCKED:
                progress.approved_at = None
            if mastery is not None and mastery.status == "aprovado" and progress.approved_at is None:
                progress.approved_at = today

            session.add(progress)

    session.commit()
    return _block_progress_by_id(session)


def _attempt_dates_by_subject(session: Session) -> dict[int, tuple[date | None, date | None]]:
    dates: dict[int, tuple[date | None, date | None]] = {}
    attempts = session.exec(
        select(QuestionAttempt).where(QuestionAttempt.subject_id.is_not(None)).order_by(QuestionAttempt.data)
    ).all()

    for attempt in attempts:
        if attempt.subject_id is None:
            continue
        first_seen, _ = dates.get(attempt.subject_id, (None, None))
        dates[attempt.subject_id] = (first_seen or attempt.data, attempt.data)

    return dates


def _last_review_dates_by_subject(session: Session) -> dict[int, date]:
    dates: dict[int, date] = {}
    reviews = session.exec(
        select(Review).where(Review.subject_id.is_not(None), Review.ultima_data.is_not(None))
    ).all()

    for review in reviews:
        if review.subject_id is None or review.ultima_data is None:
            continue
        current = dates.get(review.subject_id)
        if current is None or review.ultima_data > current:
            dates[review.subject_id] = review.ultima_data

    return dates


def sync_subject_progress(
    session: Session,
    today: date,
    block_progress_by_id: dict[int, BlockProgress],
    discipline_filter: str | None = None,
) -> dict[int, SubjectProgress]:
    subjects = session.exec(select(Subject).where(Subject.ativo == True)).all()  # noqa: E712
    links = session.exec(select(BlockSubject)).all()
    subject_progress_by_id = _subject_progress_by_id(session)
    attempt_dates = _attempt_dates_by_subject(session)
    review_dates = _last_review_dates_by_subject(session)

    block_ids_by_subject: dict[int, list[int]] = {}
    for link in links:
        block_ids_by_subject.setdefault(link.subject_id, []).append(link.block_id)

    for subject in subjects:
        if subject.id is None:
            continue
        if discipline_filter is not None and subject.disciplina != discipline_filter:
            continue

        linked_progress = [
            block_progress_by_id[block_id]
            for block_id in block_ids_by_subject.get(subject.id, [])
            if block_id in block_progress_by_id
        ]
        focus_progress = [
            progress
            for progress in linked_progress
            if block_is_focus_status(progress.status)
        ]
        reviewable_progress = [
            progress
            for progress in linked_progress
            if block_is_reviewable(progress.status)
        ]

        first_seen_at, last_attempt_at = attempt_dates.get(subject.id, (None, None))
        last_review_at = review_dates.get(subject.id)
        last_seen_candidates = [value for value in [last_attempt_at, last_review_at] if value is not None]
        last_seen_at = max(last_seen_candidates) if last_seen_candidates else None

        if focus_progress:
            status = PROGRESS_IN_PROGRESS if first_seen_at else PROGRESS_AVAILABLE
            unlocked_dates = [progress.unlocked_at for progress in focus_progress if progress.unlocked_at is not None]
            unlocked_at = min(unlocked_dates) if unlocked_dates else today
        elif reviewable_progress:
            status = PROGRESS_REVIEWING if last_seen_at else PROGRESS_MASTERED
            unlocked_dates = [progress.unlocked_at for progress in reviewable_progress if progress.unlocked_at is not None]
            unlocked_at = min(unlocked_dates) if unlocked_dates else today
        else:
            status = "locked"
            unlocked_at = None

        progress = subject_progress_by_id.get(subject.id)
        if progress is None:
            progress = SubjectProgress(subject_id=subject.id)
            subject_progress_by_id[subject.id] = progress

        progress.status = status
        progress.unlocked_at = unlocked_at
        progress.first_seen_at = first_seen_at
        progress.last_attempt_at = last_attempt_at
        progress.last_review_at = last_review_at
        progress.last_seen_at = last_seen_at
        session.add(progress)

    session.commit()
    return _subject_progress_by_id(session)


def sync_progression(
    session: Session,
    today: date,
    discipline_filter: str | None = None,
) -> tuple[dict[int, BlockProgress], dict[int, SubjectProgress]]:
    block_progress = sync_block_progress(session, today, discipline_filter=discipline_filter)
    subject_progress = sync_subject_progress(session, today, block_progress, discipline_filter=discipline_filter)
    return block_progress, subject_progress


def _snapshot_item(block: Block, status: str) -> DisciplineBlockProgressItem:
    return DisciplineBlockProgressItem(
        id=block.id or 0,
        name=block.nome,
        status=status,
    )


def _snapshot_message(status: str | None, decision: str | None) -> str:
    if status == BLOCK_STATUS_TRANSITION:
        return "Disciplina em transicao entre o bloco atual e o proximo."
    if status == BLOCK_STATUS_READY_TO_ADVANCE and decision == BLOCK_DECISION_ADVANCE_NEXT:
        return "Pronto para avancar, aguardando foco no proximo bloco."
    if status == BLOCK_STATUS_READY_TO_ADVANCE:
        return "Bloco atual pronto para avancar, mas ainda mantido como foco."
    if decision == BLOCK_DECISION_MIXED_TRANSITION:
        return "Transicao ativada entre o bloco atual e o proximo."
    if decision == BLOCK_DECISION_ADVANCE_NEXT:
        return "Avanco aplicado com o proximo bloco como foco principal."
    if status == BLOCK_STATUS_ACTIVE:
        return "Foco mantido no bloco atual."
    return "Disciplina sem bloco de foco definido no momento."


def get_discipline_progression_snapshot(
    session: Session,
    discipline: str,
) -> DisciplineBlockProgressSnapshotResponse:
    blocks = _blocks_for_normalized_discipline(session, discipline)
    if not blocks:
        raise ValueError("Disciplina nao encontrada.")

    canonical_discipline = blocks[0].disciplina
    block_progress, _ = sync_progression(session, date.today(), discipline_filter=canonical_discipline)

    active_block: Block | None = None
    active_status: str | None = None
    next_block: Block | None = None
    next_status: str | None = None
    saved_decision: str | None = None
    reviewable_blocks: list[DisciplineBlockProgressItem] = []

    for index, block in enumerate(blocks):
        progress = block_progress.get(block.id or 0)
        status = progress.status if progress is not None else BLOCK_STATUS_FUTURE_LOCKED

        if status == BLOCK_STATUS_REVIEWABLE:
            reviewable_blocks.append(_snapshot_item(block, status))

        if active_block is None and block_is_focus_status(status):
            active_block = block
            active_status = status
            saved_decision = normalize_block_decision(progress.user_decision if progress is not None else None)
            if index + 1 < len(blocks):
                next_block = blocks[index + 1]
                next_progress = block_progress.get(next_block.id or 0)
                next_status = next_progress.status if next_progress is not None else BLOCK_STATUS_FUTURE_LOCKED

    return DisciplineBlockProgressSnapshotResponse(
        discipline=canonical_discipline,
        active_block=_snapshot_item(active_block, active_status) if active_block and active_status else None,
        next_block=_snapshot_item(next_block, next_status) if next_block and next_status else None,
        reviewable_blocks=reviewable_blocks,
        saved_decision=saved_decision,
        ready_to_advance=active_status == BLOCK_STATUS_READY_TO_ADVANCE,
        message=_snapshot_message(active_status, saved_decision),
    )


def get_discipline_roadmap_progression_summary(
    session: Session,
    discipline: str,
    block_progress_by_id: dict[int, BlockProgress] | None = None,
) -> GuidedRoadmapDisciplineSummary:
    return get_discipline_guided_roadmap_summary(
        session=session,
        discipline=discipline,
        block_progress_by_id=block_progress_by_id,
    )


@dataclass(frozen=True)
class DisciplineRoadmapSubjectSummary:
    discipline: str
    mapped_node_ids: tuple[str, ...]
    available_node_ids: tuple[str, ...]
    blocked_node_ids: tuple[str, ...]
    reviewable_node_ids: tuple[str, ...]
    unmapped_subject_ids: tuple[int, ...]


def get_discipline_roadmap_subject_summary(
    session: Session,
    discipline: str,
    block_progress_by_id: dict[int, BlockProgress] | None = None,
    overview: GuidedRoadmapOverview | None = None,
) -> DisciplineRoadmapSubjectSummary:
    blocks = _blocks_for_normalized_discipline(session, discipline)
    if not blocks:
        raise ValueError("Disciplina nao encontrada.")

    canonical_discipline = blocks[0].disciplina
    if block_progress_by_id is None:
        block_progress_by_id, _ = sync_progression(session, date.today(), discipline_filter=canonical_discipline)
    if overview is None:
        overview = build_guided_roadmap_overview(session, block_progress_by_id)

    relevant_block_ids = {
        block.id or 0
        for block in blocks
        if block_progress_by_id.get(block.id or 0) is not None
        and (
            block_is_focus_status(block_progress_by_id[block.id or 0].status)
            or block_is_reviewable(block_progress_by_id[block.id or 0].status)
        )
    }
    subject_links = session.exec(select(BlockSubject).where(BlockSubject.block_id.in_(relevant_block_ids))).all() if relevant_block_ids else []
    subject_ids = {link.subject_id for link in subject_links}

    mapped_node_ids: set[str] = set()
    available_node_ids: set[str] = set()
    blocked_node_ids: set[str] = set()
    reviewable_node_ids: set[str] = set()
    unmapped_subject_ids: set[int] = set()

    for subject_id in subject_ids:
        state = overview.subject_states.get(subject_id)
        if state is None or not state.mapped or state.roadmap_node_id is None:
            unmapped_subject_ids.add(subject_id)
            continue
        mapped_node_ids.add(state.roadmap_node_id)
        if state.status in {"entry", "available"}:
            available_node_ids.add(state.roadmap_node_id)
        elif state.status in {"blocked_required", "blocked_cross_required"}:
            blocked_node_ids.add(state.roadmap_node_id)
        elif state.status == "reviewable":
            reviewable_node_ids.add(state.roadmap_node_id)

    return DisciplineRoadmapSubjectSummary(
        discipline=canonical_discipline,
        mapped_node_ids=tuple(sorted(mapped_node_ids)),
        available_node_ids=tuple(sorted(available_node_ids)),
        blocked_node_ids=tuple(sorted(blocked_node_ids)),
        reviewable_node_ids=tuple(sorted(reviewable_node_ids)),
        unmapped_subject_ids=tuple(sorted(unmapped_subject_ids)),
    )
