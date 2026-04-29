from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
import unicodedata

from sqlmodel import Session, select

from app.core.rules import STATUS_EM_RISCO, normalize_discipline_name
from app.models import (
    Block,
    BlockMastery,
    BlockProgress,
    BlockSubject,
    MockExam,
    QuestionAttempt,
    Review,
    Subject,
    SubjectProgress,
)
from app.schemas import (
    StatsDisciplineSubjectItem,
    StatsDisciplineSubjectsResponse,
    StatsDisciplineResponse,
    StatsDisciplineSignal,
    StatsDisciplineDetailResponse,
    StatsDisciplineItem,
    StatsHeatmapDay,
    StatsHeatmapResponse,
    StatsMockExamAreaAverage,
    StatsOverviewResponse,
    StatsRecentAttemptsSummary,
    StatsRiskBlock,
    StatsSubjectPerformance,
    StatsTimeSeriesPoint,
    StatsTimeSeriesResponse,
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


def _attempt_count(attempts: list[QuestionAttempt]) -> int:
    return len(attempts)


def _correct_count(attempts: list[QuestionAttempt]) -> int:
    return sum(1 for attempt in attempts if attempt.acertou)


def _date_window(days: int, today: date) -> tuple[date, date]:
    return today - timedelta(days=days - 1), today


def _filter_attempts_by_discipline(
    attempts: list[QuestionAttempt],
    discipline: str | None,
) -> list[QuestionAttempt]:
    if discipline is None:
        return attempts
    return [attempt for attempt in attempts if _matches_discipline(attempt.disciplina, discipline)]


def _subject_progress_by_subject(session: Session) -> dict[int, SubjectProgress]:
    return {
        progress.subject_id: progress
        for progress in session.exec(select(SubjectProgress)).all()
    }


def _current_streak(studied_days: list[bool]) -> int:
    streak = 0
    for studied in reversed(studied_days):
        if not studied:
            break
        streak += 1
    return streak


def _longest_streak(studied_days: list[bool]) -> int:
    longest = 0
    current = 0
    for studied in studied_days:
        if studied:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def _heatmap_intensity_level(questions_count: int, max_questions_in_day: int) -> int:
    if questions_count <= 0 or max_questions_in_day <= 0:
        return 0
    ratio = questions_count / max_questions_in_day
    if ratio <= 0.25:
        return 1
    if ratio <= 0.5:
        return 2
    if ratio <= 0.75:
        return 3
    return 4


def _week_bucket_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


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


def _canonical_text(value: str | None) -> str:
    if not value:
        return ""
    text = value.strip()
    if "Ã" in text or "�" in text:
        try:
            text = text.encode("latin1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(text.casefold().split())


def _discipline_match_key(value: str | None) -> str:
    normalized = normalize_discipline_name(value)
    if normalized in {
        "matematica",
        "natureza",
        "biologia",
        "quimica",
        "fisica",
        "linguagens",
        "humanas",
        "redacao",
    }:
        return normalized

    text = _canonical_text(value)
    if "matem" in text and "tica" in text:
        return "matematica"
    if "nature" in text or "ciencias da natureza" in text:
        return "natureza"
    if "biolog" in text:
        return "biologia"
    if "quim" in text:
        return "quimica"
    if "fis" in text:
        return "fisica"
    if any(token in text for token in ("linguag", "portug", "gramat", "literat", "interpret")):
        return "linguagens"
    if any(token in text for token in ("human", "hist", "geograf", "sociolog", "filosof")):
        return "humanas"
    if "reda" in text:
        return "redacao"
    return text


def _discipline_key(value: str | None) -> str:
    _, strategic = _discipline_label(value)
    return _discipline_match_key(strategic)


def _matches_discipline(value: str | None, requested: str) -> bool:
    requested_key = _discipline_match_key(requested)
    raw_key = _discipline_match_key(value)
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
    week_attempts = [attempt for attempt in attempts if attempt.data >= week_start]
    month_attempts = [attempt for attempt in attempts if attempt.data >= month_start]
    today_attempts = [attempt for attempt in attempts if attempt.data == today]
    today_stats = _attempt_stats(today_attempts)
    week_stats = _attempt_stats(week_attempts)
    month_stats = _attempt_stats(month_attempts)
    discipline_items = get_stats_disciplines(session)
    weak_disciplines = [
        StatsDisciplineSignal(
            discipline=item.discipline,
            strategic_discipline=item.strategic_discipline,
            questions=item.total_questions,
            accuracy=item.accuracy,
        )
        for item in discipline_items
        if item.total_questions >= WEAK_SUBJECT_MIN_ATTEMPTS and item.accuracy < WEAK_ACCURACY_THRESHOLD
    ]
    strong_disciplines = [
        StatsDisciplineSignal(
            discipline=item.discipline,
            strategic_discipline=item.strategic_discipline,
            questions=item.total_questions,
            accuracy=item.accuracy,
        )
        for item in discipline_items
        if item.total_questions >= STRONG_SUBJECT_MIN_ATTEMPTS and item.accuracy >= 0.75
    ]
    recent_activity_count = len(
        [
            attempt
            for attempt in attempts
            if attempt.data >= today - timedelta(days=6)
        ]
    )

    return StatsOverviewResponse(
        questions_today=today_stats.total,
        questions_this_week=week_stats.total,
        questions_this_month=month_stats.total,
        accuracy_today=_accuracy(today_stats.correct, today_stats.total),
        accuracy_this_week=_accuracy(week_stats.correct, week_stats.total),
        accuracy_this_month=_accuracy(month_stats.correct, month_stats.total),
        avg_time_correct_questions_seconds=month_stats.average_time_correct_questions_seconds,
        studied_subjects_this_week=len({attempt.subject_id for attempt in week_attempts if attempt.subject_id is not None}),
        impacted_blocks_this_week=len({attempt.block_id for attempt in week_attempts if attempt.block_id is not None}),
        weak_disciplines=sorted(weak_disciplines, key=lambda item: (item.accuracy, -item.questions)),
        strong_disciplines=sorted(strong_disciplines, key=lambda item: (-item.accuracy, -item.questions)),
        recent_activity_count=recent_activity_count,
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


def get_stats_discipline(session: Session, discipline: str) -> StatsDisciplineResponse:
    today = _today()
    week_start = _week_start(today)
    month_start = _month_start(today)
    attempts = [attempt for attempt in _attempts(session) if _matches_discipline(attempt.disciplina, discipline)]
    stats = _attempt_stats(attempts)
    week_attempts = [attempt for attempt in attempts if attempt.data >= week_start]
    month_attempts = [attempt for attempt in attempts if attempt.data >= month_start]
    subject_items = _subject_performance(session, attempts, discipline_filter=discipline)
    due_reviews = session.exec(select(Review).where(Review.proxima_data <= today)).all()
    due_reviews_for_discipline = 0
    for review in due_reviews:
        subject = session.get(Subject, review.subject_id) if review.subject_id is not None else None
        block = session.get(Block, review.block_id) if review.block_id is not None else None
        review_discipline = subject.disciplina if subject is not None else block.disciplina if block is not None else None
        if _matches_discipline(review_discipline, discipline):
            due_reviews_for_discipline += 1

    blocks = session.exec(select(Block).order_by(Block.ordem, Block.id)).all()
    matching_blocks = [block for block in blocks if _matches_discipline(block.disciplina, discipline)]
    block_progress = {
        progress.block_id: progress
        for progress in session.exec(select(BlockProgress)).all()
    }
    blocks_in_progress = 0
    blocks_reviewable = 0
    for block in matching_blocks:
        if block.id is None:
            continue
        progress = block_progress.get(block.id)
        status = progress.status if progress is not None else block.status
        if status in {"em_andamento", "active", "in_progress", "unlocked"}:
            blocks_in_progress += 1
        if status in {"reviewable", "pronto_revisao", "ready_to_review", "aprovado"}:
            blocks_reviewable += 1

    label = attempts[-1].disciplina if attempts else discipline
    return StatsDisciplineResponse(
        discipline=label,
        questions_this_week=len(week_attempts),
        questions_this_month=len(month_attempts),
        correct_count=stats.correct,
        incorrect_count=stats.total - stats.correct,
        accuracy=_accuracy(stats.correct, stats.total),
        avg_time_correct_questions_seconds=stats.average_time_correct_questions_seconds,
        studied_subjects=len({attempt.subject_id for attempt in attempts if attempt.subject_id is not None}),
        weak_subjects=_weak_subjects(subject_items)[:10],
        strong_subjects=_strong_subjects(subject_items)[:10],
        review_due_count=due_reviews_for_discipline,
        blocks_in_progress=blocks_in_progress,
        blocks_reviewable=blocks_reviewable,
    )


def get_stats_heatmap(
    session: Session,
    *,
    days: int = 365,
    discipline: str | None = None,
) -> StatsHeatmapResponse:
    today = _today()
    start_date, end_date = _date_window(days, today)
    filtered_attempts = [
        attempt
        for attempt in _filter_attempts_by_discipline(_attempts(session), discipline)
        if start_date <= attempt.data <= end_date
    ]
    attempts_by_day: dict[date, list[QuestionAttempt]] = defaultdict(list)
    for attempt in filtered_attempts:
        attempts_by_day[attempt.data].append(attempt)

    max_questions_in_day = 0
    day_items: list[StatsHeatmapDay] = []
    studied_flags: list[bool] = []
    total_questions = 0

    for offset in range(days):
        current_day = start_date + timedelta(days=offset)
        day_attempts = attempts_by_day.get(current_day, [])
        questions_count = _attempt_count(day_attempts)
        correct_count = _correct_count(day_attempts)
        studied = questions_count > 0
        max_questions_in_day = max(max_questions_in_day, questions_count)
        total_questions += questions_count
        studied_flags.append(studied)
        day_items.append(
            StatsHeatmapDay(
                date=current_day.isoformat(),
                weekday=current_day.weekday(),
                questions_count=questions_count,
                correct_count=correct_count,
                accuracy=_accuracy(correct_count, questions_count),
                studied=studied,
                intensity_level=0,
            )
        )

    for item in day_items:
        item.intensity_level = _heatmap_intensity_level(item.questions_count, max_questions_in_day)

    return StatsHeatmapResponse(
        discipline=discipline,
        start_date=start_date.isoformat(),
        end_date=end_date.isoformat(),
        max_questions_in_day=max_questions_in_day,
        total_questions=total_questions,
        active_days=sum(1 for studied in studied_flags if studied),
        current_streak_days=_current_streak(studied_flags),
        longest_streak_days=_longest_streak(studied_flags),
        days=day_items,
    )


def get_stats_timeseries(
    session: Session,
    *,
    group_by: str = "week",
    days: int = 180,
    discipline: str | None = None,
) -> StatsTimeSeriesResponse:
    today = _today()
    start_date, end_date = _date_window(days, today)
    filtered_attempts = [
        attempt
        for attempt in _filter_attempts_by_discipline(_attempts(session), discipline)
        if start_date <= attempt.data <= end_date
    ]

    if group_by == "day":
        attempts_by_day: dict[date, list[QuestionAttempt]] = defaultdict(list)
        for attempt in filtered_attempts:
            attempts_by_day[attempt.data].append(attempt)

        points = []
        for offset in range(days):
            current_day = start_date + timedelta(days=offset)
            day_attempts = attempts_by_day.get(current_day, [])
            stats = _attempt_stats(day_attempts)
            points.append(
                StatsTimeSeriesPoint(
                    period=current_day.isoformat(),
                    start_date=current_day.isoformat(),
                    end_date=current_day.isoformat(),
                    questions_count=stats.total,
                    correct_count=stats.correct,
                    accuracy=_accuracy(stats.correct, stats.total),
                    avg_time_correct_questions_seconds=stats.average_time_correct_questions_seconds,
                    active_days=1 if stats.total > 0 else 0,
                )
            )
        return StatsTimeSeriesResponse(discipline=discipline, group_by="day", points=points)

    attempts_by_week: dict[date, list[QuestionAttempt]] = defaultdict(list)
    for attempt in filtered_attempts:
        attempts_by_week[_week_bucket_start(attempt.data)].append(attempt)

    first_week_start = _week_bucket_start(start_date)
    last_week_start = _week_bucket_start(end_date)
    points: list[StatsTimeSeriesPoint] = []
    current_week = first_week_start
    while current_week <= last_week_start:
        bucket_attempts = attempts_by_week.get(current_week, [])
        stats = _attempt_stats(bucket_attempts)
        period_end = current_week + timedelta(days=6)
        bucket_start = max(current_week, start_date)
        bucket_end = min(period_end, end_date)
        iso_year, iso_week, _ = current_week.isocalendar()
        points.append(
            StatsTimeSeriesPoint(
                period=f"{iso_year}-W{iso_week:02d}",
                start_date=bucket_start.isoformat(),
                end_date=bucket_end.isoformat(),
                questions_count=stats.total,
                correct_count=stats.correct,
                accuracy=_accuracy(stats.correct, stats.total),
                avg_time_correct_questions_seconds=stats.average_time_correct_questions_seconds,
                active_days=len({attempt.data for attempt in bucket_attempts}),
            )
        )
        current_week += timedelta(days=7)

    return StatsTimeSeriesResponse(discipline=discipline, group_by="week", points=points)


def get_stats_discipline_subjects(session: Session, discipline: str) -> StatsDisciplineSubjectsResponse:
    attempts = [attempt for attempt in _attempts(session) if _matches_discipline(attempt.disciplina, discipline)]
    subjects = _subjects_by_id(session)
    primary_blocks = _primary_block_by_subject(session)
    mastery_by_block = _block_mastery_by_id(session)
    progress_by_subject = _subject_progress_by_subject(session)
    grouped: dict[int, list[QuestionAttempt]] = defaultdict(list)

    for attempt in attempts:
        if attempt.subject_id is None:
            continue
        grouped[attempt.subject_id].append(attempt)

    items: list[StatsDisciplineSubjectItem] = []
    for subject_id, subject_attempts in grouped.items():
        subject = subjects.get(subject_id)
        latest_attempt = max(subject_attempts, key=lambda item: (item.data, item.id or 0))
        block_id = latest_attempt.block_id or primary_blocks.get(subject_id)
        mastery = mastery_by_block.get(block_id) if block_id is not None else None
        progress = progress_by_subject.get(subject_id)
        stats = _attempt_stats(subject_attempts)
        items.append(
            StatsDisciplineSubjectItem(
                subject_id=subject_id,
                subject_name=_subject_label(subject, subject_id),
                block_id=block_id,
                questions_count=stats.total,
                correct_count=stats.correct,
                accuracy=_accuracy(stats.correct, stats.total),
                avg_time_correct_questions_seconds=stats.average_time_correct_questions_seconds,
                last_studied_at=f"{latest_attempt.data.isoformat()}T00:00:00",
                mastery_score=mastery.score_domino if mastery is not None else None,
                mastery_status=(
                    progress.status
                    if progress is not None
                    else mastery.status if mastery is not None else None
                ),
            )
        )

    items.sort(key=lambda item: (-item.questions_count, item.accuracy, item.subject_name))
    return StatsDisciplineSubjectsResponse(discipline=discipline, subjects=items)


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
