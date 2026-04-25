from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from sqlmodel import Session, select

from app.core.rules import STATUS_EM_RISCO, normalize_discipline_name
from app.models import Block, BlockMastery, BlockSubject, MockExam, QuestionAttempt, Subject
from app.schemas import (
    StatsDisciplineDetailResponse,
    StatsDisciplineItem,
    StatsMockExamAreaAverage,
    StatsOverviewResponse,
    StatsRecentAttemptsSummary,
    StatsRiskBlock,
    StatsSubjectPerformance,
    StatsTrend,
    StatsTrendPoint,
)
from app.services.discipline_normalization_service import normalize_discipline


WEAK_SUBJECT_MIN_ATTEMPTS = 3
WEAK_ACCURACY_THRESHOLD = 0.60
WEAK_MASTERY_THRESHOLD = 0.55
STRONG_SUBJECT_MIN_ATTEMPTS = 3
RISK_MASTERY_THRESHOLD = 0.55
RECENT_ATTEMPTS_LIMIT = 30


@dataclass(frozen=True)
class _AttemptStats:
    total: int
    correct: int
    average_time_correct_questions_seconds: float | None


def _today() -> date:
    return date.today()


def _week_start(today: date) -> date:
    return today - timedelta(days=today.weekday())


def _month_start(today: date) -> date:
    return today.replace(day=1)


def _accuracy(correct: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round(correct / total, 4)


def _average(values: list[int | float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def _attempt_stats(attempts: list[QuestionAttempt]) -> _AttemptStats:
    correct = sum(1 for attempt in attempts if attempt.acertou)
    correct_times = [
        attempt.tempo_segundos
        for attempt in attempts
        if attempt.acertou and attempt.tempo_segundos is not None
    ]
    return _AttemptStats(
        total=len(attempts),
        correct=correct,
        average_time_correct_questions_seconds=_average(correct_times),
    )


def _subject_label(subject: Subject | None, subject_id: int | None) -> str:
    if subject is None:
        return f"Assunto {subject_id}" if subject_id is not None else "Assunto nao identificado"
    if subject.subassunto:
        return f"{subject.assunto} - {subject.subassunto}"
    return subject.assunto


def _discipline_label(value: str | None) -> tuple[str, str]:
    normalized = normalize_discipline(value)
    discipline = (value or "").strip() or "Sem disciplina"
    strategic = normalized.strategic_discipline or discipline
    return discipline, strategic


def _discipline_key(value: str | None) -> str:
    _, strategic = _discipline_label(value)
    return normalize_discipline_name(strategic)


def _matches_discipline(value: str | None, requested: str) -> bool:
    requested_key = normalize_discipline_name(requested)
    raw_key = normalize_discipline_name(value)
    strategic_key = _discipline_key(value)
    return requested_key in {raw_key, strategic_key}


def _attempts(session: Session) -> list[QuestionAttempt]:
    return session.exec(select(QuestionAttempt).order_by(QuestionAttempt.data, QuestionAttempt.id)).all()


def _subjects_by_id(session: Session) -> dict[int, Subject]:
    return {
        subject.id: subject
        for subject in session.exec(select(Subject)).all()
        if subject.id is not None
    }


def _blocks_by_id(session: Session) -> dict[int, Block]:
    return {
        block.id: block
        for block in session.exec(select(Block)).all()
        if block.id is not None
    }


def _block_mastery_by_id(session: Session) -> dict[int, BlockMastery]:
    return {
        mastery.block_id: mastery
        for mastery in session.exec(select(BlockMastery)).all()
    }


def _primary_block_by_subject(session: Session) -> dict[int, int]:
    links = session.exec(
        select(BlockSubject, Block)
        .join(Block, Block.id == BlockSubject.block_id)
        .order_by(Block.ordem, Block.id)
    ).all()
    result: dict[int, int] = {}
    for link, block in links:
        if block.id is not None and link.subject_id not in result:
            result[link.subject_id] = block.id
    return result


def _risk_blocks(
    session: Session,
    *,
    discipline_filter: str | None = None,
) -> list[StatsRiskBlock]:
    blocks = _blocks_by_id(session)
    items: list[StatsRiskBlock] = []
    for mastery in session.exec(select(BlockMastery).order_by(BlockMastery.score_domino, BlockMastery.block_id)).all():
        block = blocks.get(mastery.block_id)
        discipline = block.disciplina if block is not None else ""
        if discipline_filter is not None and not _matches_discipline(discipline, discipline_filter):
            continue
        is_risk = mastery.status == STATUS_EM_RISCO or mastery.score_domino < RISK_MASTERY_THRESHOLD
        if not is_risk:
            continue
        reason = "Bloco em risco pelo status de dominio."
        if mastery.status != STATUS_EM_RISCO:
            reason = "Score de dominio abaixo do limiar conservador."
        items.append(
            StatsRiskBlock(
                block_id=mastery.block_id,
                block_name=block.nome if block is not None else f"Bloco {mastery.block_id}",
                discipline=discipline or "Sem disciplina",
                status=mastery.status,
                mastery_score=mastery.score_domino,
                reason=reason,
            )
        )
    return items


def _subject_performance(
    session: Session,
    attempts: list[QuestionAttempt],
    *,
    discipline_filter: str | None = None,
) -> list[StatsSubjectPerformance]:
    subjects = _subjects_by_id(session)
    primary_blocks = _primary_block_by_subject(session)
    mastery_by_block = _block_mastery_by_id(session)
    grouped: dict[int, list[QuestionAttempt]] = defaultdict(list)
    for attempt in attempts:
        if attempt.subject_id is None:
            continue
        if discipline_filter is not None and not _matches_discipline(attempt.disciplina, discipline_filter):
            continue
        grouped[attempt.subject_id].append(attempt)

    items: list[StatsSubjectPerformance] = []
    for subject_id, subject_attempts in grouped.items():
        subject = subjects.get(subject_id)
        block_id = subject_attempts[-1].block_id or primary_blocks.get(subject_id)
        mastery = mastery_by_block.get(block_id) if block_id is not None else None
        stats = _attempt_stats(subject_attempts)
        items.append(
            StatsSubjectPerformance(
                subject_id=subject_id,
                subject_name=_subject_label(subject, subject_id),
                discipline=subject.disciplina if subject is not None else subject_attempts[-1].disciplina,
                block_id=block_id,
                attempts=stats.total,
                correct=stats.correct,
                accuracy=_accuracy(stats.correct, stats.total),
                mastery_score=mastery.score_domino if mastery is not None else None,
            )
        )
    return items


def _weak_subjects(subjects: list[StatsSubjectPerformance]) -> list[StatsSubjectPerformance]:
    weak = [
        item
        for item in subjects
        if item.attempts >= WEAK_SUBJECT_MIN_ATTEMPTS
        and (
            item.accuracy < WEAK_ACCURACY_THRESHOLD
            or (item.mastery_score is not None and item.mastery_score < WEAK_MASTERY_THRESHOLD)
        )
    ]
    return sorted(
        weak,
        key=lambda item: (
            item.accuracy,
            item.mastery_score if item.mastery_score is not None else 1.0,
            -item.attempts,
        ),
    )


def _strong_subjects(subjects: list[StatsSubjectPerformance]) -> list[StatsSubjectPerformance]:
    strong = [
        item
        for item in subjects
        if item.attempts >= STRONG_SUBJECT_MIN_ATTEMPTS
        and item.accuracy >= 0.75
    ]
    return sorted(
        strong,
        key=lambda item: (
            -item.accuracy,
            -(item.mastery_score if item.mastery_score is not None else 0.0),
            -item.attempts,
        ),
    )


def _trend(attempts: list[QuestionAttempt], days: int, period: str, today: date) -> StatsTrend:
    start = today - timedelta(days=days - 1)
    grouped: dict[date, list[QuestionAttempt]] = defaultdict(list)
    for attempt in attempts:
        if start <= attempt.data <= today:
            grouped[attempt.data].append(attempt)

    points: list[StatsTrendPoint] = []
    for offset in range(days):
        point_date = start + timedelta(days=offset)
        day_attempts = grouped.get(point_date, [])
        stats = _attempt_stats(day_attempts)
        points.append(
            StatsTrendPoint(
                date=point_date.isoformat(),
                questions=stats.total,
                correct=stats.correct,
                accuracy=_accuracy(stats.correct, stats.total),
            )
        )
    return StatsTrend(period=period, points=points)  # type: ignore[arg-type]


def _mock_exam_averages(session: Session, *, discipline_filter: str | None = None) -> list[StatsMockExamAreaAverage]:
    exams = session.exec(select(MockExam).order_by(MockExam.data.desc(), MockExam.id.desc())).all()
    grouped: dict[str, list[MockExam]] = defaultdict(list)
    for exam in exams:
        if discipline_filter is not None and not _matches_discipline(exam.area, discipline_filter):
            continue
        if len(grouped[exam.area]) < 3:
            grouped[exam.area].append(exam)

    result: list[StatsMockExamAreaAverage] = []
    for area, area_exams in sorted(grouped.items()):
        total_questions = [exam.total_questoes for exam in area_exams]
        correct = [exam.total_acertos for exam in area_exams]
        accuracies = [
            exam.total_acertos / exam.total_questoes
            for exam in area_exams
            if exam.total_questoes > 0
        ]
        result.append(
            StatsMockExamAreaAverage(
                area=area,
                exams_count=len(area_exams),
                average_accuracy=round(sum(accuracies) / len(accuracies), 4) if accuracies else None,
                average_correct=_average(correct),
                average_total_questions=_average(total_questions),
            )
        )
    return result


def get_stats_overview(session: Session) -> StatsOverviewResponse:
    today = _today()
    week_start = _week_start(today)
    month_start = _month_start(today)
    attempts = _attempts(session)
    all_stats = _attempt_stats(attempts)
    week_attempts = [attempt for attempt in attempts if attempt.data >= week_start]
    month_attempts = [attempt for attempt in attempts if attempt.data >= month_start]
    today_attempts = [attempt for attempt in attempts if attempt.data == today]
    week_stats = _attempt_stats(week_attempts)
    month_stats = _attempt_stats(month_attempts)
    subject_items = _subject_performance(session, attempts)

    return StatsOverviewResponse(
        total_questions_all_time=all_stats.total,
        total_questions_today=len(today_attempts),
        total_questions_this_week=week_stats.total,
        total_questions_this_month=month_stats.total,
        accuracy_all_time=_accuracy(all_stats.correct, all_stats.total),
        accuracy_this_week=_accuracy(week_stats.correct, week_stats.total),
        accuracy_this_month=_accuracy(month_stats.correct, month_stats.total),
        average_time_correct_questions_seconds=all_stats.average_time_correct_questions_seconds,
        studied_subjects_this_week=len({attempt.subject_id for attempt in week_attempts if attempt.subject_id is not None}),
        impacted_blocks_this_week=len({attempt.block_id for attempt in week_attempts if attempt.block_id is not None}),
        risk_blocks_count=len(_risk_blocks(session)),
        weak_subjects_count=len(_weak_subjects(subject_items)),
        mock_exam_last3_by_area=_mock_exam_averages(session),
    )


def get_stats_disciplines(session: Session) -> list[StatsDisciplineItem]:
    today = _today()
    week_start = _week_start(today)
    month_start = _month_start(today)
    attempts = _attempts(session)
    grouped: dict[str, list[QuestionAttempt]] = defaultdict(list)
    labels: dict[str, tuple[str, str]] = {}
    for attempt in attempts:
        key = _discipline_key(attempt.disciplina)
        grouped[key].append(attempt)
        labels.setdefault(key, _discipline_label(attempt.disciplina))

    subject_items = _subject_performance(session, attempts)
    result: list[StatsDisciplineItem] = []
    for key, discipline_attempts in grouped.items():
        discipline, strategic = labels[key]
        stats = _attempt_stats(discipline_attempts)
        week_attempts = [attempt for attempt in discipline_attempts if attempt.data >= week_start]
        month_attempts = [attempt for attempt in discipline_attempts if attempt.data >= month_start]
        discipline_subjects = [
            item for item in subject_items if _matches_discipline(item.discipline, discipline)
        ]
        result.append(
            StatsDisciplineItem(
                discipline=discipline,
                strategic_discipline=strategic,
                total_questions=stats.total,
                correct_questions=stats.correct,
                accuracy=_accuracy(stats.correct, stats.total),
                questions_this_week=len(week_attempts),
                questions_this_month=len(month_attempts),
                average_time_correct_questions_seconds=stats.average_time_correct_questions_seconds,
                studied_subjects_count=len({attempt.subject_id for attempt in discipline_attempts if attempt.subject_id is not None}),
                weak_subjects_count=len(_weak_subjects(discipline_subjects)),
                risk_blocks_count=len(_risk_blocks(session, discipline_filter=discipline)),
            )
        )

    return sorted(result, key=lambda item: (-item.total_questions, item.strategic_discipline, item.discipline))


def _empty_discipline_summary(discipline: str) -> StatsDisciplineItem:
    _, strategic = _discipline_label(discipline)
    return StatsDisciplineItem(
        discipline=discipline,
        strategic_discipline=strategic,
        total_questions=0,
        correct_questions=0,
        accuracy=0.0,
        questions_this_week=0,
        questions_this_month=0,
        average_time_correct_questions_seconds=None,
        studied_subjects_count=0,
        weak_subjects_count=0,
        risk_blocks_count=0,
    )


def get_stats_discipline_detail(session: Session, discipline: str) -> StatsDisciplineDetailResponse:
    today = _today()
    week_start = _week_start(today)
    month_start = _month_start(today)
    attempts = [attempt for attempt in _attempts(session) if _matches_discipline(attempt.disciplina, discipline)]
    stats = _attempt_stats(attempts)
    week_attempts = [attempt for attempt in attempts if attempt.data >= week_start]
    month_attempts = [attempt for attempt in attempts if attempt.data >= month_start]
    subject_items = _subject_performance(session, attempts, discipline_filter=discipline)
    risk_blocks = _risk_blocks(session, discipline_filter=discipline)
    summary = _empty_discipline_summary(discipline)
    if attempts:
        summary = StatsDisciplineItem(
            discipline=attempts[-1].disciplina,
            strategic_discipline=_discipline_label(attempts[-1].disciplina)[1],
            total_questions=stats.total,
            correct_questions=stats.correct,
            accuracy=_accuracy(stats.correct, stats.total),
            questions_this_week=len(week_attempts),
            questions_this_month=len(month_attempts),
            average_time_correct_questions_seconds=stats.average_time_correct_questions_seconds,
            studied_subjects_count=len({attempt.subject_id for attempt in attempts if attempt.subject_id is not None}),
            weak_subjects_count=len(_weak_subjects(subject_items)),
            risk_blocks_count=len(risk_blocks),
        )

    recent_attempts = sorted(attempts, key=lambda item: (item.data, item.id or 0), reverse=True)[:RECENT_ATTEMPTS_LIMIT]
    recent_stats = _attempt_stats(recent_attempts)

    return StatsDisciplineDetailResponse(
        summary=summary,
        trend_last_7_days=_trend(attempts, 7, "last_7_days", today),
        trend_last_30_days=_trend(attempts, 30, "last_30_days", today),
        top_weak_subjects=_weak_subjects(subject_items)[:10],
        top_strongest_subjects=_strong_subjects(subject_items)[:10],
        risk_blocks=risk_blocks[:10],
        recent_attempts_summary=StatsRecentAttemptsSummary(
            total_questions=recent_stats.total,
            correct_questions=recent_stats.correct,
            accuracy=_accuracy(recent_stats.correct, recent_stats.total),
            average_time_correct_questions_seconds=recent_stats.average_time_correct_questions_seconds,
        ),
        mock_exam_last3_by_area=_mock_exam_averages(session, discipline_filter=discipline),
    )
