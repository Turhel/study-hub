from __future__ import annotations

from datetime import date
from itertools import groupby

from sqlmodel import Session, select

from app.core.rules import (
    PROGRESS_APPROVED,
    PROGRESS_AVAILABLE,
    PROGRESS_IN_PROGRESS,
    PROGRESS_LOCKED,
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


def sync_block_progress(session: Session, today: date) -> dict[int, BlockProgress]:
    blocks = session.exec(select(Block).order_by(Block.disciplina, Block.ordem, Block.id)).all()
    mastery_by_id = _block_mastery_by_id(session)
    progress_by_id = _block_progress_by_id(session)

    for discipline, discipline_blocks_iter in groupby(blocks, key=lambda block: block.disciplina):
        previous_approved = True
        discipline_blocks = list(discipline_blocks_iter)

        for block in discipline_blocks:
            if block.id is None:
                continue

            mastery = mastery_by_id.get(block.id)
            is_approved = mastery is not None and mastery.status == "aprovado"

            if is_approved:
                status = PROGRESS_APPROVED
            elif previous_approved:
                status = PROGRESS_IN_PROGRESS if _block_has_attempts(session, block.id) else PROGRESS_AVAILABLE
            else:
                status = PROGRESS_LOCKED

            progress = progress_by_id.get(block.id)
            if progress is None:
                progress = BlockProgress(block_id=block.id)
                progress_by_id[block.id] = progress

            was_unlocked = progress.unlocked_at is not None
            progress.status = status

            if status in {PROGRESS_AVAILABLE, PROGRESS_IN_PROGRESS, PROGRESS_APPROVED} and not was_unlocked:
                progress.unlocked_at = today
            if status == PROGRESS_LOCKED:
                progress.unlocked_at = None
                progress.approved_at = None
            if status == PROGRESS_APPROVED and progress.approved_at is None:
                progress.approved_at = today

            session.add(progress)
            previous_approved = status == PROGRESS_APPROVED

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

        linked_progress = [
            block_progress_by_id[block_id]
            for block_id in block_ids_by_subject.get(subject.id, [])
            if block_id in block_progress_by_id
        ]
        active_progress = [
            progress
            for progress in linked_progress
            if progress.status in {PROGRESS_AVAILABLE, PROGRESS_IN_PROGRESS}
        ]
        approved_progress = [
            progress
            for progress in linked_progress
            if progress.status == PROGRESS_APPROVED
        ]

        first_seen_at, last_attempt_at = attempt_dates.get(subject.id, (None, None))
        last_review_at = review_dates.get(subject.id)
        last_seen_candidates = [value for value in [last_attempt_at, last_review_at] if value is not None]
        last_seen_at = max(last_seen_candidates) if last_seen_candidates else None

        if active_progress:
            status = PROGRESS_IN_PROGRESS if first_seen_at else PROGRESS_AVAILABLE
            unlocked_dates = [progress.unlocked_at for progress in active_progress if progress.unlocked_at is not None]
            unlocked_at = min(unlocked_dates) if unlocked_dates else today
        elif approved_progress:
            status = PROGRESS_REVIEWING if last_seen_at else PROGRESS_MASTERED
            unlocked_dates = [progress.unlocked_at for progress in approved_progress if progress.unlocked_at is not None]
            unlocked_at = min(unlocked_dates) if unlocked_dates else today
        else:
            status = PROGRESS_LOCKED
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


def sync_progression(session: Session, today: date) -> tuple[dict[int, BlockProgress], dict[int, SubjectProgress]]:
    block_progress = sync_block_progress(session, today)
    subject_progress = sync_subject_progress(session, today, block_progress)
    return block_progress, subject_progress
