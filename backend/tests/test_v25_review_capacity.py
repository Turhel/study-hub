from __future__ import annotations

import shutil
import tempfile
from datetime import date, timedelta
from pathlib import Path

from sqlmodel import Session, select

from app.db import create_db_engine, init_db
from app.models import (
    Block,
    BlockMastery,
    BlockSubject,
    MockExam,
    MockExamQuestion,
    QuestionAttempt,
    Review,
)
from app.services.capacity_service import get_or_create_user_energy_settings, update_weekly_progression_target
from app.services.mastery_service import recalculate_block_mastery
from app.services.review_service import generate_r1_tribunal_session


def _session():
    temp_dir = Path(tempfile.mkdtemp(prefix="v25-retaguarda-"))
    engine = create_db_engine(f"sqlite:///{(temp_dir / 'case.db').as_posix()}")
    init_db(engine)
    session = Session(engine, expire_on_commit=False)
    return session, engine, temp_dir


def _cleanup(session: Session, engine, temp_dir: Path) -> None:
    session.close()
    engine.dispose()
    shutil.rmtree(temp_dir, ignore_errors=True)


def _block(session: Session, name: str = "Bloco 1", discipline: str = "Matematica") -> Block:
    block = Block(nome=name, disciplina=discipline, ordem=1)
    session.add(block)
    session.commit()
    session.refresh(block)
    return block


def test_r1_tribunal_prefers_saved_bank_failures() -> None:
    session, engine, temp_dir = _session()
    try:
        block = _block(session)
        exam = MockExam(tipo="saved_bank", area="Matematica", mode="saved_bank", total_questoes=1, total_acertos=0)
        session.add(exam)
        session.commit()
        session.refresh(exam)
        saved = MockExamQuestion(
            mock_exam_id=exam.id or 0,
            question_number=1,
            source_type="saved_bank",
            discipline="Matematica",
            block_id=block.id,
            is_correct=False,
            prompt_markdown="Erro real salvo",
        )
        session.add(saved)
        session.add(
            QuestionAttempt(
                data=date.today(),
                disciplina="Matematica",
                block_id=block.id,
                acertou=False,
                dificuldade_banco="media",
            )
        )
        session.commit()

        tribunal = generate_r1_tribunal_session(session, block.id or 0)

        assert tribunal.mode == "tribunal"
        assert len(tribunal.questions) == 1
        assert tribunal.questions[0].source == "saved_bank"
        assert tribunal.questions[0].prompt_markdown == "Erro real salvo"
    finally:
        _cleanup(session, engine, temp_dir)


def test_r1_light_uses_global_questions_when_no_initial_errors() -> None:
    session, engine, temp_dir = _session()
    try:
        block = _block(session)
        subject_id = 101
        session.add(BlockSubject(block_id=block.id or 0, subject_id=subject_id))
        exam = MockExam(tipo="Banco global", area="Matematica", mode="external", total_questoes=5, total_acertos=0)
        session.add(exam)
        session.commit()
        session.refresh(exam)
        for number in range(1, 7):
            session.add(
                MockExamQuestion(
                    mock_exam_id=exam.id or 0,
                    question_number=number,
                    source_type="external",
                    discipline="Matematica",
                    subject_id=subject_id,
                    prompt_markdown=f"Questao {number}",
                )
            )
        session.commit()

        tribunal = generate_r1_tribunal_session(session, block.id or 0)

        assert tribunal.mode == "r1_light"
        assert len(tribunal.questions) == 5
        assert all(question.source == "external" for question in tribunal.questions)
    finally:
        _cleanup(session, engine, temp_dir)


def test_r6_soberano_schedules_elastic_long_term_review() -> None:
    session, engine, temp_dir = _session()
    try:
        block = _block(session)
        other_block = _block(session, name="Bloco 2")
        session.add(BlockMastery(block_id=block.id or 0, eaere_stage="R6"))
        session.add(BlockMastery(block_id=other_block.id or 0, eaere_stage="R3"))
        attempts = [
            QuestionAttempt(
                data=date.today(),
                source="pytest-r6",
                disciplina="Matematica",
                block_id=block.id,
                acertou=True,
                dificuldade_banco="media",
            )
            for _ in range(5)
        ]
        for attempt in attempts:
            session.add(attempt)
        session.commit()

        mastery = recalculate_block_mastery(session, block.id or 0, current_attempts=attempts)
        review = session.exec(select(Review).where(Review.block_id == block.id)).first()

        assert mastery.eaere_stage == "R7"
        assert review is not None
        assert review.intervalo_dias == 90
        assert review.proxima_data == date.today() + timedelta(days=90)
    finally:
        _cleanup(session, engine, temp_dir)


def test_weekly_progression_increases_question_target_with_high_accuracy() -> None:
    session, engine, temp_dir = _session()
    try:
        settings = get_or_create_user_energy_settings(session)
        settings.current_daily_target_questions = 20
        session.add(settings)
        for index in range(10):
            session.add(
                QuestionAttempt(
                    data=date.today() - timedelta(days=index % 7),
                    disciplina="Matematica",
                    block_id=1,
                    acertou=True,
                    dificuldade_banco="media",
                )
            )
        session.commit()

        updated = update_weekly_progression_target(session)

        assert updated.current_daily_target_questions == 25
    finally:
        _cleanup(session, engine, temp_dir)
