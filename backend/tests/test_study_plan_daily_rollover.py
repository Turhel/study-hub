from __future__ import annotations

import shutil
import tempfile
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from sqlmodel import Session, select

from app.db import create_db_engine, init_db
from app.models import DailyStudyPlan
from app.schemas import StudyGuidePreferences
from app.services.capacity_service import update_study_guide_preferences
from app.services.roadmap_import_service import import_roadmap_from_csv
from app.services.progression_service import sync_progression
from app.services.study_plan_service import get_today_study_plan, recalculate_today_study_plan
from app.services.repo_seed_service import sync_structural_seed_into_session

_STUDY_TZ = ZoneInfo("America/Sao_Paulo")
_DAY_A = date(2026, 6, 10)
_DAY_B = date(2026, 6, 11)


@pytest.fixture()
def study_plan_session() -> Session:
    temp_dir = Path(tempfile.mkdtemp(prefix="study-plan-rollover-"))
    db_path = temp_dir / "rollover.db"
    engine = create_db_engine(f"sqlite:///{db_path.as_posix()}")
    init_db(engine)

    session = Session(engine, expire_on_commit=False)
    sync_structural_seed_into_session(session, apply_changes=True)
    import_roadmap_from_csv(session, delete_missing=False)
    sync_progression(session, _DAY_A)
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

    try:
        yield session
    finally:
        session.close()
        engine.dispose()
        shutil.rmtree(temp_dir, ignore_errors=True)


def _active_plan_for_day(session: Session, plan_day: date) -> DailyStudyPlan | None:
    return session.exec(
        select(DailyStudyPlan)
        .where(DailyStudyPlan.status == "active")
        .where(DailyStudyPlan.plan_date == plan_day)
        .order_by(DailyStudyPlan.created_at.desc())
    ).first()


def _plan_by_id(session: Session, plan_id: int | None) -> DailyStudyPlan | None:
    if plan_id is None:
        return None
    return session.get(DailyStudyPlan, plan_id)


def test_same_day_reuses_active_plan(study_plan_session: Session) -> None:
    session = study_plan_session
    with patch("app.services.study_plan_service._current_plan_day", return_value=_DAY_A):
        first = get_today_study_plan(session)
        first_plan = _active_plan_for_day(session, _DAY_A)
        second = get_today_study_plan(session)
        second_plan = _active_plan_for_day(session, _DAY_A)

    assert first.summary.focus_count > 0
    assert first_plan is not None
    assert second_plan is not None
    assert first_plan.id == second_plan.id
    assert second.summary.total_questions == first.summary.total_questions


def test_next_day_generates_new_plan(study_plan_session: Session) -> None:
    session = study_plan_session
    with patch("app.services.study_plan_service._current_plan_day", return_value=_DAY_A):
        day_a_response = get_today_study_plan(session)
        day_a_plan = _active_plan_for_day(session, _DAY_A)

    with patch("app.services.study_plan_service._current_plan_day", return_value=_DAY_B):
        day_b_response = get_today_study_plan(session)
        day_b_plan = _active_plan_for_day(session, _DAY_B)

    assert day_a_plan is not None
    assert day_b_plan is not None
    assert day_a_plan.id != day_b_plan.id
    assert day_a_plan.plan_date == _DAY_A
    assert day_b_plan.plan_date == _DAY_B
    assert day_b_response.summary.focus_count > 0
    assert day_a_response.summary.focus_count > 0


def test_rollover_marks_previous_day_as_replaced(study_plan_session: Session) -> None:
    session = study_plan_session
    with patch("app.services.study_plan_service._current_plan_day", return_value=_DAY_A):
        get_today_study_plan(session)
        day_a_plan = _active_plan_for_day(session, _DAY_A)
        day_a_plan_id = day_a_plan.id if day_a_plan is not None else None

    with patch("app.services.study_plan_service._current_plan_day", return_value=_DAY_B):
        get_today_study_plan(session)

    replaced_plan = _plan_by_id(session, day_a_plan_id)
    assert replaced_plan is not None
    assert replaced_plan.status == "replaced"
    assert replaced_plan.plan_date == _DAY_A


def test_brazil_timezone_evening_then_morning_creates_new_plan(study_plan_session: Session) -> None:
    session = study_plan_session
    evening = datetime(2026, 5, 19, 23, 30, tzinfo=_STUDY_TZ)
    morning = datetime(2026, 5, 20, 8, 0, tzinfo=_STUDY_TZ)

    with patch("app.services.study_plan_service.datetime") as mock_datetime:
        mock_datetime.now.side_effect = lambda tz=None: evening if tz is not None else evening.replace(tzinfo=None)
        evening_plan = recalculate_today_study_plan(session).plan

    evening_row = session.exec(
        select(DailyStudyPlan).order_by(DailyStudyPlan.created_at.desc()).limit(1)
    ).first()
    assert evening_row is not None
    assert evening_row.plan_date == date(2026, 5, 19)

    with patch("app.services.study_plan_service.datetime") as mock_datetime:
        mock_datetime.now.side_effect = lambda tz=None: morning if tz is not None else morning.replace(tzinfo=None)
        morning_plan = get_today_study_plan(session)

    morning_row = _active_plan_for_day(session, date(2026, 5, 20))
    assert morning_row is not None
    assert morning_row.id != evening_row.id
    assert morning_row.plan_date == date(2026, 5, 20)
    assert _plan_by_id(session, evening_row.id) is not None
    assert _plan_by_id(session, evening_row.id).status == "replaced"
    assert morning_plan.summary.focus_count > 0
    assert evening_plan.summary.focus_count > 0
