from __future__ import annotations

import shutil
import tempfile
from datetime import date, timedelta
from pathlib import Path

from sqlmodel import Session

from app.db import create_db_engine, init_db
from app.models import Block, BlockMastery, BlockSubject, Review, Subject, UserCalendarEvent
from app.routes.study_guide import _study_reference_day, build_calendar_projection
from app.services.repo_seed_service import sync_structural_seed_into_session
from app.services.roadmap_import_service import import_roadmap_from_csv
from app.services.study_plan_service import build_study_plan_calendar


def _session() -> tuple[Session, object, Path]:
    temp_dir = Path(tempfile.mkdtemp(prefix="calendar-projection-"))
    engine = create_db_engine(f"sqlite:///{(temp_dir / 'case.db').as_posix()}")
    init_db(engine)
    session = Session(engine, expire_on_commit=False)
    sync_structural_seed_into_session(session, apply_changes=True)
    import_roadmap_from_csv(session, delete_missing=False)
    return session, engine, temp_dir


def _cleanup(session: Session, engine, temp_dir: Path) -> None:
    session.close()
    engine.dispose()
    shutil.rmtree(temp_dir, ignore_errors=True)


def test_projection_lists_due_reviews_with_subjects_predicted() -> None:
    session, engine, temp_dir = _session()
    try:
        today = _study_reference_day()
        block = Block(nome="Genetica", disciplina="Biologia", ordem=1)
        session.add(block)
        session.commit()
        session.refresh(block)

        subject = Subject(disciplina="Biologia", assunto="Genetica", subassunto=None)
        session.add(subject)
        session.commit()
        session.refresh(subject)

        session.add(BlockSubject(block_id=block.id or 0, subject_id=subject.id or 0))
        session.add(BlockMastery(block_id=block.id or 0, eaere_stage="R2"))
        session.add(
            Review(
                subject_id=subject.id,
                block_id=block.id,
                proxima_data=today,
                status="pendente",
            )
        )
        session.commit()

        payload = build_calendar_projection(session, today=today)

        today_payload = next(day for day in payload if day.date == today.isoformat())
        assert today_payload.revisoes_count >= 1
        assert any("Bio:" in label and "(R2)" in label for label in today_payload.subjects_predicted)
        assert today_payload.total_questoes_estimadas > 0
    finally:
        _cleanup(session, engine, temp_dir)


def test_projection_rolls_reprimidos_to_next_day() -> None:
    session, engine, temp_dir = _session()
    try:
        today = _study_reference_day()
        block = Block(nome="Ligacoes", disciplina="Quimica", ordem=1)
        session.add(block)
        session.commit()
        session.refresh(block)

        subject = Subject(disciplina="Quimica", assunto="Ligacoes", subassunto=None)
        session.add(subject)
        session.commit()
        session.refresh(subject)

        session.add(BlockSubject(block_id=block.id or 0, subject_id=subject.id or 0))
        session.add(BlockMastery(block_id=block.id or 0, eaere_stage="RR"))
        for offset in range(6):
            session.add(
                Review(
                    subject_id=subject.id,
                    block_id=block.id,
                    proxima_data=today,
                    status="pendente",
                )
            )
        session.commit()

        payload = build_calendar_projection(session, today=today)
        today_payload = next(day for day in payload if day.date == today.isoformat())
        tomorrow_payload = next(day for day in payload if day.date == (today + timedelta(days=1)).isoformat())

        assert today_payload.revisoes_count >= 1
        assert tomorrow_payload.revisoes_count >= 1
        assert len(today_payload.subjects_predicted) >= 1
        assert len(tomorrow_payload.subjects_predicted) >= 1
    finally:
        _cleanup(session, engine, temp_dir)


def test_review_scheduled_for_tomorrow_appears_on_tomorrow_not_today() -> None:
    session, engine, temp_dir = _session()
    try:
        today = date(2026, 6, 15)
        tomorrow = today + timedelta(days=1)
        block = Block(nome="Eletroquimica", disciplina="Quimica", ordem=1)
        session.add(block)
        session.commit()
        session.refresh(block)

        subject = Subject(disciplina="Quimica", assunto="Eletroquimica", subassunto=None)
        session.add(subject)
        session.commit()
        session.refresh(subject)

        session.add(BlockSubject(block_id=block.id or 0, subject_id=subject.id or 0))
        session.add(BlockMastery(block_id=block.id or 0, eaere_stage="R3"))
        session.add(
            Review(
                subject_id=subject.id,
                block_id=block.id,
                proxima_data=tomorrow,
                status="pendente",
            )
        )
        session.commit()

        payload = build_calendar_projection(session, today=today)
        today_payload = next(day for day in payload if day.date == today.isoformat())
        tomorrow_payload = next(day for day in payload if day.date == tomorrow.isoformat())

        assert all("Eletroquimica" not in label for label in today_payload.subjects_predicted)
        assert any("Química: Eletroquimica (R3)" in label or "Quimica: Eletroquimica (R3)" in label for label in tomorrow_payload.subjects_predicted)
    finally:
        _cleanup(session, engine, temp_dir)


def test_projection_includes_trail_focus_for_tomorrow() -> None:
    session, engine, temp_dir = _session()
    try:
        today = date(2026, 6, 15)
        tomorrow = today + timedelta(days=1)
        day_after = today + timedelta(days=2)
        study_calendar = build_study_plan_calendar(session, start_day=today, days=7)
        tomorrow_calendar = next(day for day in study_calendar.days if day.date == tomorrow.isoformat())
        day_after_calendar = next(day for day in study_calendar.days if day.date == day_after.isoformat())
        expected_focus_items = [item for item in tomorrow_calendar.items if item.type == "study_focus"]
        day_after_focus_items = [item for item in day_after_calendar.items if item.type == "study_focus"]

        payload = build_calendar_projection(session, today=today)
        tomorrow_payload = next(day for day in payload if day.date == tomorrow.isoformat())
        day_after_payload = next(day for day in payload if day.date == day_after.isoformat())

        assert len(tomorrow_payload.focus_subjects_predicted) == len(expected_focus_items)
        if expected_focus_items:
            assert tomorrow_payload.total_questoes_estimadas >= sum(item.planned_questions for item in expected_focus_items)
            assert tomorrow_payload.subjects_predicted == []
        if expected_focus_items and day_after_focus_items:
            tomorrow_subjects = {item.subject_id for item in expected_focus_items}
            day_after_subjects = {item.subject_id for item in day_after_focus_items}
            assert tomorrow_subjects.isdisjoint(day_after_subjects)
            assert day_after_payload.focus_subjects_predicted
    finally:
        _cleanup(session, engine, temp_dir)


def test_academic_exams_day_suppresses_future_focus_projection() -> None:
    session, engine, temp_dir = _session()
    try:
        today = date(2026, 6, 15)
        tomorrow = today + timedelta(days=1)
        session.add(
            UserCalendarEvent(
                event_type="PROVAS_ACADEMICAS",
                start_date=tomorrow,
                end_date=tomorrow,
            )
        )
        session.commit()

        payload = build_calendar_projection(session, today=today)
        tomorrow_payload = next(day for day in payload if day.date == tomorrow.isoformat())

        assert tomorrow_payload.status_protecao == "provas_academicas"
        assert tomorrow_payload.focus_subjects_predicted == []
        assert all("Foco previsto:" not in item for item in tomorrow_payload.scheduled_items)
        assert tomorrow_payload.total_questoes_estimadas <= 5
    finally:
        _cleanup(session, engine, temp_dir)


def test_travel_day_clears_subjects_predicted() -> None:
    session, engine, temp_dir = _session()
    try:
        today = _study_reference_day()
        session.add(
            UserCalendarEvent(
                event_type="VIAGEM_DESCANSO",
                start_date=today,
                end_date=today,
            )
        )
        session.commit()

        payload = build_calendar_projection(session, today=today)
        today_payload = next(day for day in payload if day.date == today.isoformat())

        assert today_payload.status_protecao == "viagem_descanso"
        assert today_payload.subjects_predicted == []
        assert today_payload.total_questoes_estimadas == 0
    finally:
        _cleanup(session, engine, temp_dir)
