from __future__ import annotations

import shutil
import tempfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.main import app
from app.db import create_db_engine, init_db
from app.models import (
    BlockMastery,
    DailyStudyPlan,
    EssayCorrection,
    EssayStudyMessage,
    EssayStudySession,
    EssaySubmission,
    LessonContent,
    MockExam,
    QuestionAttempt,
    Review,
    StudyCapacity,
    StudyEvent,
    Subject,
    TimerSession,
    TimerSessionItem,
)
from app.schemas import QuestionAttemptBulkCreate, ResetStudyDataRequest
from app.services.capacity_service import get_or_create_capacity
from app.services.free_study_service import get_free_study_catalog
from app.services.progression_service import sync_progression
from app.services.question_attempt_service import register_question_attempts_bulk
from app.services.repo_seed_service import sync_structural_seed_into_session
from app.services.reset_service import RESET_STUDY_CONFIRMATION_TEXT, reset_study_data
from app.services.roadmap_import_service import import_roadmap_from_csv
from app.services.study_plan_service import get_today_study_plan, recalculate_today_study_plan


@dataclass
class ResetContext:
    session: Session
    engine: object
    temp_dir: Path


def _seed_usage_data(session: Session) -> dict[str, int]:
    capacity = get_or_create_capacity(session)
    capacity.daily_minutes = 120
    capacity.intensity = "forte"
    capacity.max_focus_count = 4
    capacity.max_questions = 40
    session.add(capacity)
    session.commit()

    plan = recalculate_today_study_plan(session).plan
    assert plan.items
    first_item = plan.items[0]

    register_question_attempts_bulk(
        session,
        QuestionAttemptBulkCreate(
            date=date.today().isoformat(),
            discipline=first_item.discipline,
            block_id=first_item.block_id,
            subject_id=first_item.subject_id,
            source="pytest-reset",
            quantity=6,
            correct_count=4,
            difficulty_bank="media",
            difficulty_personal="media",
            elapsed_seconds=600,
            confidence="media",
            notes="reset test",
            study_mode="guided",
        ),
    )

    session.add(
        TimerSession(
            discipline=first_item.discipline,
            block_name=first_item.block_name,
            subject_name=first_item.subject_name,
            mode="guided",
            planned_questions=6,
            target_seconds_per_question=90,
            total_elapsed_seconds=540,
            completed_count=6,
            skipped_count=0,
            overtime_count=0,
            average_seconds_completed=90,
            difficulty_general="media",
            volume_perceived="adequado",
            notes="timer reset test",
        )
    )
    session.commit()
    timer = session.exec(select(TimerSession).order_by(TimerSession.id.desc())).first()
    assert timer is not None and timer.id is not None
    session.add(
        TimerSessionItem(
            session_id=timer.id,
            question_number=1,
            status="completed",
            elapsed_seconds=90,
            exceeded_target=False,
        )
    )

    session.add(
        MockExam(
            area=first_item.discipline,
            tipo="treino",
            total_questoes=45,
            total_acertos=30,
            tempo_total_min=120,
            observacoes="reset test",
        )
    )

    subject = session.get(Subject, first_item.subject_id)
    assert subject is not None
    session.add(
        LessonContent(
            roadmap_node_id=first_item.roadmap_node_id,
            subject_id=first_item.subject_id,
            title="Aula preservada",
            body_markdown="Conteudo estrutural preservado.",
            is_published=True,
        )
    )

    submission = EssaySubmission(theme="Tema teste", essay_text="Texto curto de teste.")
    session.add(submission)
    session.commit()
    session.refresh(submission)
    correction = EssayCorrection(
        essay_submission_id=submission.id or 0,
        provider="pytest",
        model="fake-model",
        prompt_name="essay_correction",
        prompt_hash="hash",
        mode="detailed",
        estimated_score_min=600,
        estimated_score_max=700,
        c1_score=120,
        c1_comment="ok",
        c2_score=120,
        c2_comment="ok",
        c3_score=120,
        c3_comment="ok",
        c4_score=120,
        c4_comment="ok",
        c5_score=120,
        c5_comment="ok",
        strengths_json='["forca"]',
        weaknesses_json='["fraqueza"]',
        improvement_plan_json='["plano"]',
        confidence_note="ok",
        tokens_input=100,
        tokens_output=200,
        tokens_total=300,
    )
    session.add(correction)
    session.commit()
    session.refresh(correction)
    study_session = EssayStudySession(
        essay_submission_id=submission.id or 0,
        essay_correction_id=correction.id or 0,
        provider="pytest",
        model="fake-model",
        prompt_name="essay_study",
        prompt_hash="hash",
        status="active",
        tokens_total=50,
    )
    session.add(study_session)
    session.commit()
    session.refresh(study_session)
    session.add(
        EssayStudyMessage(
            session_id=study_session.id or 0,
            role="assistant",
            content="Mensagem de estudo.",
            tokens_estimated=20,
        )
    )

    mastery = session.exec(select(BlockMastery).where(BlockMastery.block_id == first_item.block_id)).first()
    if mastery is None:
        mastery = BlockMastery(block_id=first_item.block_id)
    mastery.facil_total = 2
    mastery.facil_acertos = 2
    mastery.media_total = 4
    mastery.media_acertos = 3
    mastery.status = "em_andamento"
    mastery.score_domino = 0.6
    session.add(mastery)
    session.commit()

    return {
        "subject_id": first_item.subject_id,
        "block_id": first_item.block_id,
    }


def _snapshot_counts(session: Session) -> dict[str, int]:
    return {
        "subjects": len(session.exec(select(Subject)).all()),
        "lesson_contents": len(session.exec(select(LessonContent)).all()),
        "question_attempts": len(session.exec(select(QuestionAttempt)).all()),
        "reviews": len(session.exec(select(Review)).all()),
        "study_events": len(session.exec(select(StudyEvent)).all()),
        "daily_study_plan": len(session.exec(select(DailyStudyPlan)).all()),
        "timer_sessions": len(session.exec(select(TimerSession)).all()),
        "timer_session_items": len(session.exec(select(TimerSessionItem)).all()),
        "mock_exams": len(session.exec(select(MockExam)).all()),
        "essay_submissions": len(session.exec(select(EssaySubmission)).all()),
        "essay_corrections": len(session.exec(select(EssayCorrection)).all()),
        "essay_study_sessions": len(session.exec(select(EssayStudySession)).all()),
        "essay_study_messages": len(session.exec(select(EssayStudyMessage)).all()),
        "study_capacity": len(session.exec(select(StudyCapacity)).all()),
        "block_mastery": len(session.exec(select(BlockMastery)).all()),
    }


def _build_context() -> ResetContext:
    temp_dir = Path(tempfile.mkdtemp(prefix="study-reset-tests-"))
    db_path = temp_dir / "reset_cases.db"
    engine = create_db_engine(f"sqlite:///{db_path.as_posix()}")
    init_db(engine)
    session = Session(engine, expire_on_commit=False)
    sync_structural_seed_into_session(session, apply_changes=True)
    import_roadmap_from_csv(session, delete_missing=False)
    sync_progression(session, date.today())
    _seed_usage_data(session)
    return ResetContext(session=session, engine=engine, temp_dir=temp_dir)


def _cleanup_context(context: ResetContext) -> None:
    context.session.close()
    context.engine.dispose()
    shutil.rmtree(context.temp_dir, ignore_errors=True)


def test_reset_study_data_dry_run_keeps_counts_unchanged() -> None:
    context = _build_context()
    try:
        before = _snapshot_counts(context.session)
        response = reset_study_data(
            context.session,
            ResetStudyDataRequest(
                confirmation_text=RESET_STUDY_CONFIRMATION_TEXT,
                dry_run=True,
                reset_preferences=False,
                include_essays=False,
            ),
        )
        after = _snapshot_counts(context.session)

        assert response.dry_run is True
        assert before == after
        assert response.deleted_counts["question_attempts"] == before["question_attempts"]
        assert response.deleted_counts["essay_submissions"] == 0
        assert "lesson_contents" in response.preserved_tables
    finally:
        _cleanup_context(context)


def test_reset_study_data_apply_preserves_structure_and_essays() -> None:
    context = _build_context()
    try:
        capacity = get_or_create_capacity(context.session)
        assert capacity.daily_minutes == 120
        essay_before = _snapshot_counts(context.session)["essay_submissions"]

        response = reset_study_data(
            context.session,
            ResetStudyDataRequest(
                confirmation_text=RESET_STUDY_CONFIRMATION_TEXT,
                dry_run=False,
                reset_preferences=False,
                include_essays=False,
            ),
        )

        capacity = get_or_create_capacity(context.session)
        catalog = get_free_study_catalog(context.session)
        plan = get_today_study_plan(context.session)
        counts = _snapshot_counts(context.session)

        assert response.dry_run is False
        assert counts["question_attempts"] == 0
        assert counts["reviews"] == 0
        assert counts["study_events"] <= 1
        assert counts["daily_study_plan"] >= 1
        assert counts["timer_sessions"] == 0
        assert counts["timer_session_items"] == 0
        assert counts["mock_exams"] == 0
        assert counts["lesson_contents"] == 1
        assert counts["subjects"] > 0
        assert counts["essay_submissions"] == essay_before
        assert response.essays_deleted is False
        assert response.preferences_reset is False
        assert capacity.daily_minutes == 120
        assert catalog.disciplines
        assert plan.items
        assert response.reset_counts["block_progress_after_sync"] > 0
        assert response.reset_counts["subject_progress_after_sync"] > 0
    finally:
        _cleanup_context(context)


def test_reset_study_data_apply_can_reset_preferences_and_delete_essays() -> None:
    context = _build_context()
    try:
        response = reset_study_data(
            context.session,
            ResetStudyDataRequest(
                confirmation_text=RESET_STUDY_CONFIRMATION_TEXT,
                dry_run=False,
                reset_preferences=True,
                include_essays=True,
            ),
        )

        counts = _snapshot_counts(context.session)
        capacity = get_or_create_capacity(context.session)
        plan = get_today_study_plan(context.session)

        assert response.preferences_reset is True
        assert response.essays_deleted is True
        assert counts["essay_submissions"] == 0
        assert counts["essay_corrections"] == 0
        assert counts["essay_study_sessions"] == 0
        assert counts["essay_study_messages"] == 0
        assert capacity.daily_minutes == 90
        assert capacity.intensity == "normal"
        assert capacity.max_focus_count == 3
        assert capacity.max_questions == 35
        assert capacity.include_reviews is True
        assert capacity.include_new_content is True
        assert plan.items
    finally:
        _cleanup_context(context)


def test_reset_route_rejects_wrong_confirmation(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.system.get_session", lambda: Session(context.engine, expire_on_commit=False))
        client = TestClient(app)
        response = client.post(
            "/api/system/reset-study-data",
            json={
                "confirmation_text": "ERRADO",
                "dry_run": True,
                "reset_preferences": False,
                "include_essays": False,
            },
        )
        assert response.status_code == 400
        payload = response.json()
        assert payload["detail"]["code"] == "invalid_confirmation_text"
    finally:
        _cleanup_context(context)
