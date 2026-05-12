from __future__ import annotations

import shutil
import tempfile
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from sqlmodel import Session

from app.db import create_db_engine, init_db
from app.models import Block, BlockMastery, BlockSubject, QuestionAttempt, Subject, SubjectProgress
from app.services.stats_service import (
    get_stats_discipline_subjects,
    get_stats_heatmap,
    get_stats_timeseries,
)
import app.services.stats_service as stats_service


@dataclass
class StatsContext:
    session: Session
    engine: object
    temp_dir: Path
    today: date
    math_subject_id: int
    chemistry_subject_id: int


def _add_attempts(
    session: Session,
    *,
    attempt_date: date,
    discipline: str,
    block_id: int,
    subject_id: int,
    total: int,
    correct: int,
    elapsed_seconds: int = 90,
) -> None:
    for index in range(total):
        session.add(
            QuestionAttempt(
                data=attempt_date,
                disciplina=discipline,
                block_id=block_id,
                subject_id=subject_id,
                acertou=index < correct,
                tempo_segundos=elapsed_seconds if index < correct else None,
                dificuldade_banco="media",
            )
        )
    session.commit()


def _build_context(today_override: date | None = None) -> StatsContext:
    temp_dir = Path(tempfile.mkdtemp(prefix="study-stats-graphs-"))
    db_path = temp_dir / "stats_graphs.db"
    engine = create_db_engine(f"sqlite:///{db_path.as_posix()}")
    init_db(engine)
    session = Session(engine, expire_on_commit=False)

    math_block = Block(nome="Bloco Mat", disciplina="Matemática", ordem=1)
    chemistry_block = Block(nome="Bloco Qui", disciplina="Química", ordem=1)
    session.add(math_block)
    session.add(chemistry_block)
    session.commit()
    session.refresh(math_block)
    session.refresh(chemistry_block)

    math_subject = Subject(disciplina="Matemática", assunto="Operacoes", subassunto="Inteiros")
    chemistry_subject = Subject(disciplina="Química", assunto="Ligações", subassunto="Ionica")
    session.add(math_subject)
    session.add(chemistry_subject)
    session.commit()
    session.refresh(math_subject)
    session.refresh(chemistry_subject)

    session.add(BlockSubject(block_id=math_block.id or 0, subject_id=math_subject.id or 0))
    session.add(BlockSubject(block_id=chemistry_block.id or 0, subject_id=chemistry_subject.id or 0))
    session.add(
        BlockMastery(
            block_id=math_block.id or 0,
            status="em_andamento",
            score_domino=0.72,
        )
    )
    session.add(
        BlockMastery(
            block_id=chemistry_block.id or 0,
            status="em_risco",
            score_domino=0.42,
        )
    )
    session.add(
        SubjectProgress(
            subject_id=math_subject.id or 0,
            status="available",
            last_attempt_at=today_override or date.today(),
        )
    )
    session.add(
        SubjectProgress(
            subject_id=chemistry_subject.id or 0,
            status="reviewable",
            last_attempt_at=today_override or date.today(),
        )
    )
    session.commit()

    today = today_override or date.today()
    _add_attempts(
        session,
        attempt_date=today - timedelta(days=6),
        discipline="Matemática",
        block_id=math_block.id or 0,
        subject_id=math_subject.id or 0,
        total=4,
        correct=3,
    )
    _add_attempts(
        session,
        attempt_date=today - timedelta(days=2),
        discipline="Matemática",
        block_id=math_block.id or 0,
        subject_id=math_subject.id or 0,
        total=2,
        correct=2,
        elapsed_seconds=105,
    )
    _add_attempts(
        session,
        attempt_date=today - timedelta(days=1),
        discipline="Química",
        block_id=chemistry_block.id or 0,
        subject_id=chemistry_subject.id or 0,
        total=5,
        correct=2,
        elapsed_seconds=130,
    )

    return StatsContext(
        session=session,
        engine=engine,
        temp_dir=temp_dir,
        today=today,
        math_subject_id=math_subject.id or 0,
        chemistry_subject_id=chemistry_subject.id or 0,
    )


def _cleanup_context(context: StatsContext) -> None:
    context.session.close()
    context.engine.dispose()
    shutil.rmtree(context.temp_dir, ignore_errors=True)


def test_heatmap_returns_all_days_and_zero_day() -> None:
    context = _build_context()
    try:
        payload = get_stats_heatmap(context.session, days=7)

        assert len(payload.days) == 7
        zero_day = next(item for item in payload.days if item.date == (context.today - timedelta(days=5)).isoformat())
        studied_day = next(item for item in payload.days if item.date == (context.today - timedelta(days=6)).isoformat())

        assert zero_day.questions_count == 0
        assert zero_day.correct_count == 0
        assert zero_day.accuracy == 0.0
        assert zero_day.studied is False
        assert studied_day.questions_count == 4
        assert studied_day.correct_count == 3
        assert studied_day.accuracy == 0.75
        assert studied_day.studied is True
    finally:
        _cleanup_context(context)


def test_heatmap_filters_by_discipline() -> None:
    context = _build_context()
    try:
        payload = get_stats_heatmap(context.session, days=7, discipline="Matematica")

        assert payload.discipline == "Matematica"
        assert payload.total_questions == 6
        assert payload.active_days == 2
        assert all(
            item.questions_count == 0 or item.date in {
                (context.today - timedelta(days=6)).isoformat(),
                (context.today - timedelta(days=2)).isoformat(),
            }
            for item in payload.days
        )
    finally:
        _cleanup_context(context)


def test_timeseries_week_aggregates_correctly(monkeypatch) -> None:
    fixed_today = date(2026, 5, 7)
    monkeypatch.setattr(stats_service, "_today", lambda: fixed_today)
    context = _build_context(today_override=fixed_today)
    try:
        payload = get_stats_timeseries(context.session, group_by="week", days=14, discipline="Matematica")

        assert payload.group_by == "week"
        points_by_period = {point.period: point for point in payload.points}
        older_week = (context.today - timedelta(days=6)).isocalendar()
        current_week = context.today.isocalendar()

        older = points_by_period[f"{older_week.year}-W{older_week.week:02d}"]
        current = points_by_period[f"{current_week.year}-W{current_week.week:02d}"]

        assert older.questions_count == 4
        assert older.correct_count == 3
        assert older.accuracy == 0.75
        assert current.questions_count == 2
        assert current.correct_count == 2
        assert current.active_days == 1
    finally:
        _cleanup_context(context)


def test_timeseries_day_returns_stable_points() -> None:
    context = _build_context()
    try:
        payload = get_stats_timeseries(context.session, group_by="day", days=7)

        assert len(payload.points) == 7
        chemistry_day = next(point for point in payload.points if point.start_date == (context.today - timedelta(days=1)).isoformat())
        assert chemistry_day.questions_count == 5
        assert chemistry_day.correct_count == 2
        assert chemistry_day.active_days == 1
    finally:
        _cleanup_context(context)


def test_discipline_subject_breakdown_uses_counts_mastery_and_status() -> None:
    context = _build_context()
    try:
        payload = get_stats_discipline_subjects(context.session, "Quimica")

        assert payload.discipline == "Quimica"
        assert len(payload.subjects) == 1
        subject = payload.subjects[0]
        assert subject.subject_id == context.chemistry_subject_id
        assert subject.questions_count == 5
        assert subject.correct_count == 2
        assert subject.accuracy == 0.4
        assert subject.mastery_score == 0.42
        assert subject.mastery_status == "reviewable"
        assert subject.last_studied_at == f"{(context.today - timedelta(days=1)).isoformat()}T00:00:00"
    finally:
        _cleanup_context(context)
