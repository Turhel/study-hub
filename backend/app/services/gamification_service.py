from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlmodel import Session, select

from app.models import BlockProgress, QuestionAttempt, Review, StudyEvent, Subject
from app.schemas import (
    GamificationMasteryResponse,
    GamificationStreakResponse,
    GamificationSummaryResponse,
    GamificationTopMasterySubject,
)


REAL_STUDY_EVENT_TYPES = {"question_attempt_bulk", "review_upsert", "block_progress_decision"}
WEEKDAY_LABELS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]


def _today() -> date:
    return date.today()


def _subject_label(subject: Subject | None, subject_id: int) -> str:
    if subject is None:
        return f"Assunto {subject_id}"
    if subject.subassunto:
        return f"{subject.assunto} - {subject.subassunto}"
    return subject.assunto


def _accuracy(correct: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round(correct / total, 4)


def _question_stars(attempts_count: int, accuracy: float) -> int:
    if attempts_count >= 30 and accuracy >= 0.90:
        return 3
    if attempts_count >= 20 and accuracy >= 0.85:
        return 2
    if attempts_count >= 10 and accuracy >= 0.75:
        return 1
    return 0


def _consistency_stars(study_days_count: int) -> int:
    if study_days_count >= 14:
        return 3
    if study_days_count >= 7:
        return 2
    if study_days_count >= 3:
        return 1
    return 0


def _review_stars(review: Review | None) -> int:
    if review is None or review.ultima_data is None:
        return 0
    if review.intervalo_dias >= 21:
        return 3
    if review.intervalo_dias >= 7:
        return 2
    if review.intervalo_dias >= 2:
        return 1
    return 0


def _block_decision_dates(session: Session) -> set[date]:
    dates: set[date] = set()
    for progress in session.exec(select(BlockProgress).where(BlockProgress.user_decision != "continue_current")):
        decision_date = progress.approved_at or progress.unlocked_at
        if decision_date is not None:
            dates.add(decision_date)
    return dates


def _real_study_dates(session: Session) -> set[date]:
    dates = {attempt.data for attempt in session.exec(select(QuestionAttempt)).all()}
    dates.update(
        review.ultima_data
        for review in session.exec(select(Review).where(Review.ultima_data.is_not(None))).all()
        if review.ultima_data is not None
    )
    dates.update(_block_decision_dates(session))
    dates.update(
        event.created_at.date()
        for event in session.exec(select(StudyEvent).where(StudyEvent.event_type.in_(REAL_STUDY_EVENT_TYPES))).all()
    )
    return dates


def _streak_from_dates(study_dates: set[date], today: date) -> GamificationStreakResponse:
    ordered = sorted(study_dates)
    studied_today = today in study_dates
    last_study_date = ordered[-1] if ordered else None
    current = 0
    cursor = today
    if not studied_today:
        cursor = today - timedelta(days=1)
    while cursor in study_dates:
        current += 1
        cursor -= timedelta(days=1)

    longest = 0
    running = 0
    previous: date | None = None
    for item in ordered:
        if previous is not None and item == previous + timedelta(days=1):
            running += 1
        else:
            running = 1
        longest = max(longest, running)
        previous = item

    active_weekdays = [
        WEEKDAY_LABELS[item.weekday()]
        for item in sorted({study_date for study_date in study_dates if study_date >= today - timedelta(days=6)})
    ]
    return GamificationStreakResponse(
        current_streak_days=current,
        longest_streak_days=longest,
        studied_today=studied_today,
        active_weekdays=active_weekdays,
        last_study_date=last_study_date.isoformat() if last_study_date is not None else None,
    )


def _mastery(session: Session) -> GamificationMasteryResponse:
    subjects = {
        subject.id: subject
        for subject in session.exec(select(Subject)).all()
        if subject.id is not None
    }
    attempts_by_subject: dict[int, list[QuestionAttempt]] = defaultdict(list)
    for attempt in session.exec(select(QuestionAttempt)).all():
        if attempt.subject_id is not None:
            attempts_by_subject[attempt.subject_id].append(attempt)

    reviews_by_subject: dict[int, Review] = {}
    for review in session.exec(select(Review)).all():
        if review.subject_id is not None:
            current = reviews_by_subject.get(review.subject_id)
            if current is None or (review.ultima_data or date.min) > (current.ultima_data or date.min):
                reviews_by_subject[review.subject_id] = review

    question_total = 0
    review_total = 0
    consistency_total = 0
    mastered_subjects_count = 0
    top_subjects: list[GamificationTopMasterySubject] = []
    subject_ids = set(attempts_by_subject) | set(reviews_by_subject)
    for subject_id in subject_ids:
        attempts = attempts_by_subject.get(subject_id, [])
        attempts_count = len(attempts)
        correct = sum(1 for attempt in attempts if attempt.acertou)
        accuracy = _accuracy(correct, attempts_count)
        q_stars = _question_stars(attempts_count, accuracy)
        r_stars = _review_stars(reviews_by_subject.get(subject_id))
        c_stars = _consistency_stars(len({attempt.data for attempt in attempts}))
        stars = q_stars + r_stars + c_stars
        question_total += q_stars
        review_total += r_stars
        consistency_total += c_stars
        if stars >= 3:
            mastered_subjects_count += 1
        if stars > 0:
            subject = subjects.get(subject_id)
            top_subjects.append(
                GamificationTopMasterySubject(
                    subject_id=subject_id,
                    subject_name=_subject_label(subject, subject_id),
                    discipline=(
                        subject.disciplina
                        if subject is not None
                        else attempts[-1].disciplina
                        if attempts
                        else "Sem disciplina"
                    ),
                    stars=stars,
                    question_accuracy=accuracy,
                    attempts_count=attempts_count,
                )
            )

    top_subjects = sorted(
        top_subjects,
        key=lambda item: (-item.stars, -item.question_accuracy, -item.attempts_count, item.subject_name),
    )[:10]
    return GamificationMasteryResponse(
        total_mastery_stars=question_total + review_total + consistency_total,
        question_mastery_stars=question_total,
        review_mastery_stars=review_total,
        consistency_mastery_stars=consistency_total,
        mastered_subjects_count=mastered_subjects_count,
        top_mastery_subjects=top_subjects,
        metadata={
            "review_mastery_rule": "0 estrelas quando nao ha ultima_data/intervalo suficiente em reviews.",
            "consistency_mastery_rule": "1/2/3 estrelas com 3/7/14 dias distintos no mesmo subject.",
        },
    )


def get_gamification_summary(session: Session) -> GamificationSummaryResponse:
    today = _today()
    study_dates = _real_study_dates(session)
    return GamificationSummaryResponse(
        streak=_streak_from_dates(study_dates, today),
        mastery=_mastery(session),
    )
