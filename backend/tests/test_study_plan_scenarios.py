from __future__ import annotations

import shutil
import tempfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
from sqlmodel import Session, select

from app.db import create_db_engine, init_db
from app.models import DailyStudyPlan
from app.schemas import QuestionAttemptBulkCreate, StudyGuidePreferences
from app.services.capacity_service import get_or_create_capacity, safe_daily_question_load, update_study_guide_preferences
from app.services.progression_service import sync_progression
from app.services.question_attempt_service import register_question_attempts_bulk
from app.services.repo_seed_service import sync_structural_seed_into_session
from app.services.roadmap_import_service import import_roadmap_from_csv
from app.services.roadmap_progression_service import build_guided_roadmap_overview
from app.services.study_plan_service import (
    _create_plan,
    _eligible_candidates,
    _focus_count_for_load,
    _question_distribution,
    _select_candidates,
    build_study_plan_calendar,
    get_today_study_plan,
    recalculate_today_study_plan,
)


@dataclass
class SeededStudyPlanContext:
    session: Session
    engine: object
    db_path: Path
    base_day: date


@dataclass(frozen=True)
class PlanPreview:
    total_questions: int
    focus_count: int
    candidate_count: int
    selected_block_ids: tuple[int, ...]
    selected_subject_ids: tuple[int, ...]
    selected_disciplines: tuple[str, ...]
    selected_subject_names: tuple[str, ...]
    selected_planned_modes: tuple[str, ...]
    selected_primary_reasons: tuple[str, ...]
    selected_roadmap_reasons: tuple[str | None, ...]


def _build_preview(session: Session, today: date) -> PlanPreview:
    block_progress, subject_progress = sync_progression(session, today)
    roadmap_overview = build_guided_roadmap_overview(session, block_progress)
    candidates = _eligible_candidates(session, today, block_progress, subject_progress, roadmap_overview)
    capacity = get_or_create_capacity(session)
    total_questions = safe_daily_question_load(capacity)
    focus_count = _focus_count_for_load(total_questions, len(candidates), capacity.max_focus_count)
    selected = _select_candidates(candidates, focus_count)
    _question_distribution(total_questions, len(selected))
    return PlanPreview(
        total_questions=total_questions,
        focus_count=len(selected),
        candidate_count=len(candidates),
        selected_block_ids=tuple(candidate.block_id for candidate in selected),
        selected_subject_ids=tuple(candidate.subject_id for candidate in selected),
        selected_disciplines=tuple(candidate.discipline for candidate in selected),
        selected_subject_names=tuple(candidate.subject_name for candidate in selected),
        selected_planned_modes=tuple(candidate.planned_mode for candidate in selected),
        selected_primary_reasons=tuple(candidate.primary_reason for candidate in selected),
        selected_roadmap_reasons=tuple(candidate.roadmap_reason for candidate in selected),
    )


def _selected_candidates_and_counts(
    session: Session,
    today: date,
) -> tuple[list, list[int]]:
    block_progress, subject_progress = sync_progression(session, today)
    roadmap_overview = build_guided_roadmap_overview(session, block_progress)
    candidates = _eligible_candidates(session, today, block_progress, subject_progress, roadmap_overview)
    capacity = get_or_create_capacity(session)
    total_questions = safe_daily_question_load(capacity)
    focus_count = _focus_count_for_load(total_questions, len(candidates), capacity.max_focus_count)
    selected = _select_candidates(candidates, focus_count)
    question_counts = _question_distribution(total_questions, len(selected))
    return selected, question_counts


@pytest.fixture()
def seeded_context() -> SeededStudyPlanContext:
    temp_dir = Path(tempfile.mkdtemp(prefix="study-plan-scenarios-"))
    db_path = temp_dir / "study_plan_cases.db"
    engine = create_db_engine(f"sqlite:///{db_path.as_posix()}")
    init_db(engine)

    session = Session(engine, expire_on_commit=False)
    sync_structural_seed_into_session(session, apply_changes=True)
    import_roadmap_from_csv(session, delete_missing=False)
    base_day = date(2026, 4, 29)
    sync_progression(session, base_day)

    try:
        yield SeededStudyPlanContext(
            session=session,
            engine=engine,
            db_path=db_path,
            base_day=base_day,
        )
    finally:
        session.close()
        engine.dispose()
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_light_preferences_limit_plan(seeded_context: SeededStudyPlanContext) -> None:
    session = seeded_context.session
    update_study_guide_preferences(
        session,
        StudyGuidePreferences(
            daily_minutes=15,
            intensity="leve",
            max_focus_count=1,
            max_questions=5,
            include_reviews=True,
            include_new_content=True,
        ),
    )

    plan = recalculate_today_study_plan(session).plan

    assert plan.summary.focus_count <= 1
    assert plan.summary.total_questions <= 5
    assert len(plan.items) <= 1


def test_strong_preferences_are_ceiling_not_required_focus_count(seeded_context: SeededStudyPlanContext) -> None:
    session = seeded_context.session
    update_study_guide_preferences(
        session,
        StudyGuidePreferences(
            daily_minutes=180,
            intensity="forte",
            max_focus_count=5,
            max_questions=50,
            include_reviews=True,
            include_new_content=True,
        ),
    )

    preview = _build_preview(session, seeded_context.base_day)
    capacity = get_or_create_capacity(session)
    natural_focus_count = _focus_count_for_load(preview.total_questions, preview.candidate_count, capacity.max_focus_count)

    plan = recalculate_today_study_plan(session).plan

    assert plan.summary.focus_count <= 5
    assert plan.summary.total_questions <= 50
    assert plan.summary.focus_count == natural_focus_count
    assert natural_focus_count == 2
    assert preview.candidate_count >= plan.summary.focus_count


def test_recalculate_keeps_single_active_plan_for_current_day(seeded_context: SeededStudyPlanContext) -> None:
    session = seeded_context.session
    update_study_guide_preferences(
        session,
        StudyGuidePreferences(
            daily_minutes=90,
            intensity="normal",
            max_focus_count=3,
            max_questions=35,
            include_reviews=True,
            include_new_content=True,
        ),
    )

    responses = [recalculate_today_study_plan(session) for _ in range(3)]
    active_plans = session.exec(
        select(DailyStudyPlan)
        .where(DailyStudyPlan.status == "active")
        .order_by(DailyStudyPlan.created_at.desc(), DailyStudyPlan.id.desc())
    ).all()
    replaced_plans = session.exec(
        select(DailyStudyPlan)
        .where(DailyStudyPlan.status == "replaced")
        .order_by(DailyStudyPlan.created_at.desc(), DailyStudyPlan.id.desc())
    ).all()
    latest_plan = get_today_study_plan(session)

    assert len(active_plans) == 1
    assert len(replaced_plans) >= 2
    assert latest_plan.summary.total_questions == responses[-1].plan.summary.total_questions
    assert latest_plan.summary.focus_count == responses[-1].plan.summary.focus_count


def test_good_math_advances_or_reduces_same_focus_next_day(seeded_context: SeededStudyPlanContext) -> None:
    session = seeded_context.session
    update_study_guide_preferences(
        session,
        StudyGuidePreferences(
            daily_minutes=180,
            intensity="forte",
            max_focus_count=5,
            max_questions=50,
            include_reviews=True,
            include_new_content=True,
        ),
    )

    today_preview = _build_preview(session, seeded_context.base_day)
    math_index = next(index for index, discipline in enumerate(today_preview.selected_disciplines) if "Matem" in discipline)
    math_subject_id = today_preview.selected_subject_ids[math_index]
    math_subject_name = today_preview.selected_subject_names[math_index]

    register_question_attempts_bulk(
        session,
        QuestionAttemptBulkCreate(
            date=seeded_context.base_day.isoformat(),
            discipline=today_preview.selected_disciplines[math_index],
            block_id=today_preview.selected_block_ids[math_index],
            subject_id=math_subject_id,
            source="pytest-study-plan",
            quantity=20,
            correct_count=19,
            difficulty_bank="media",
            difficulty_personal="media",
            elapsed_seconds=120,
            confidence="alta",
            notes="math good",
            study_mode="guided",
        ),
    )

    tomorrow_preview = _build_preview(session, seeded_context.base_day + timedelta(days=1))
    repeated_math_same_subject = math_subject_id in tomorrow_preview.selected_subject_ids

    if repeated_math_same_subject:
        repeated_index = tomorrow_preview.selected_subject_ids.index(math_subject_id)
        reason = " ".join(
            filter(
                None,
                [
                    tomorrow_preview.selected_primary_reasons[repeated_index],
                    tomorrow_preview.selected_roadmap_reasons[repeated_index],
                ],
            )
        ).lower()
        assert any(
            marker in reason
            for marker in ("contatos minimos", "revis", "desempenho", "reforco", "progress")
        )
    else:
        assert any("Matem" in discipline for discipline in tomorrow_preview.selected_disciplines)
        assert math_subject_name not in tomorrow_preview.selected_subject_names


def test_bad_chemistry_keeps_reinforcement_reason_next_day(seeded_context: SeededStudyPlanContext) -> None:
    session = seeded_context.session
    update_study_guide_preferences(
        session,
        StudyGuidePreferences(
            daily_minutes=180,
            intensity="forte",
            max_focus_count=5,
            max_questions=50,
            include_reviews=True,
            include_new_content=True,
        ),
    )

    today_preview = _build_preview(session, seeded_context.base_day)
    chemistry_index = next(index for index, discipline in enumerate(today_preview.selected_disciplines) if "Qu" in discipline)
    chemistry_subject_id = today_preview.selected_subject_ids[chemistry_index]

    register_question_attempts_bulk(
        session,
        QuestionAttemptBulkCreate(
            date=seeded_context.base_day.isoformat(),
            discipline=today_preview.selected_disciplines[chemistry_index],
            block_id=today_preview.selected_block_ids[chemistry_index],
            subject_id=chemistry_subject_id,
            source="pytest-study-plan",
            quantity=12,
            correct_count=2,
            difficulty_bank="media",
            difficulty_personal="dificil",
            elapsed_seconds=180,
            confidence="baixa",
            error_type="conceito",
            notes="chem bad",
            study_mode="guided",
        ),
    )

    tomorrow_preview = _build_preview(session, seeded_context.base_day + timedelta(days=1))

    assert chemistry_subject_id in tomorrow_preview.selected_subject_ids
    repeated_index = tomorrow_preview.selected_subject_ids.index(chemistry_subject_id)
    combined_reason = " ".join(
        filter(
            None,
            [
                tomorrow_preview.selected_primary_reasons[repeated_index],
                tomorrow_preview.selected_roadmap_reasons[repeated_index],
                tomorrow_preview.selected_planned_modes[repeated_index],
            ],
        )
    ).lower()

    assert any(
        marker in combined_reason
        for marker in ("reforco", "desempenho", "contatos minimos", "aprendizado", "revis")
    )


def test_calendar_returns_seven_days(seeded_context: SeededStudyPlanContext) -> None:
    calendar = build_study_plan_calendar(
        seeded_context.session,
        start_day=seeded_context.base_day,
        days=7,
    )

    assert len(calendar.days) == 7
    assert calendar.start_date == seeded_context.base_day.isoformat()
    assert calendar.end_date == (seeded_context.base_day + timedelta(days=6)).isoformat()


def test_calendar_today_reflects_active_plan(seeded_context: SeededStudyPlanContext) -> None:
    session = seeded_context.session
    selected, question_counts = _selected_candidates_and_counts(session, seeded_context.base_day)
    plan = _create_plan(session, selected, question_counts)
    plan.created_at = datetime.combine(seeded_context.base_day, datetime.min.time())
    session.add(plan)
    session.commit()

    calendar = build_study_plan_calendar(session, start_day=seeded_context.base_day, days=7)

    assert calendar.days[0].status == "today"
    assert calendar.days[0].total_questions == sum(question_counts)
    assert calendar.days[0].focus_count == len(selected)
    assert calendar.days[0].items[0].subject_id == selected[0].subject_id


def test_calendar_carry_over_when_today_has_pending(seeded_context: SeededStudyPlanContext) -> None:
    session = seeded_context.session
    update_study_guide_preferences(
        session,
        StudyGuidePreferences(
            daily_minutes=90,
            intensity="normal",
            max_focus_count=3,
            max_questions=35,
            include_reviews=True,
            include_new_content=True,
        ),
    )
    selected, question_counts = _selected_candidates_and_counts(session, seeded_context.base_day)
    plan = _create_plan(session, selected, question_counts)
    plan.created_at = datetime.combine(seeded_context.base_day, datetime.min.time())
    session.add(plan)
    session.commit()

    first_subject_id = selected[0].subject_id
    first_block_id = selected[0].block_id
    first_discipline = selected[0].discipline
    first_subject_name = selected[0].subject_name

    register_question_attempts_bulk(
        session,
        QuestionAttemptBulkCreate(
            date=seeded_context.base_day.isoformat(),
            discipline=first_discipline,
            block_id=first_block_id,
            subject_id=first_subject_id,
            source="pytest-calendar",
            quantity=3,
            correct_count=2,
            difficulty_bank="media",
            difficulty_personal="media",
            study_mode="guided",
        ),
    )

    calendar = build_study_plan_calendar(session, start_day=seeded_context.base_day, days=7)
    tomorrow = calendar.days[1]

    assert tomorrow.status == "adjusted"
    assert any(item.subject_id == first_subject_id for item in tomorrow.items)
    carry_over_item = next(item for item in tomorrow.items if item.subject_id == first_subject_id)
    assert carry_over_item.subject_name == first_subject_name
    assert "Pendencia" in carry_over_item.reason


def test_calendar_light_preferences_limit_load(seeded_context: SeededStudyPlanContext) -> None:
    session = seeded_context.session
    update_study_guide_preferences(
        session,
        StudyGuidePreferences(
            daily_minutes=15,
            intensity="leve",
            max_focus_count=1,
            max_questions=5,
            include_reviews=True,
            include_new_content=True,
        ),
    )

    calendar = build_study_plan_calendar(session, start_day=seeded_context.base_day, days=7)
    tomorrow = calendar.days[1]

    assert tomorrow.focus_count <= 1
    assert tomorrow.total_questions <= 5


def test_calendar_does_not_break_without_history(seeded_context: SeededStudyPlanContext) -> None:
    calendar = build_study_plan_calendar(
        seeded_context.session,
        start_day=seeded_context.base_day,
        days=7,
    )

    assert calendar.days[0].reason
    assert all(day.items for day in calendar.days)
