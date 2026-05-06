from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

from sqlalchemy import func
from sqlmodel import Session, select

from app.db import DATABASE_URL, engine, get_database_target_display, init_db
from app.models import (
    Block,
    BlockProgress,
    BlockSubject,
    RoadmapBlockMap,
    RoadmapEdge,
    RoadmapNode,
    RoadmapRule,
    StudyCapacity,
    Subject,
    SubjectProgress,
)
from app.services.progression_service import sync_progression
from app.services.repo_seed_service import sync_structural_seed_into_session
from app.services.roadmap_diff_service import get_roadmap_dry_run
from app.services.roadmap_import_service import import_roadmap_from_csv
from app.settings import is_sqlite_database_url


@dataclass(frozen=True)
class BootstrapCounts:
    subjects: int
    blocks: int
    block_subjects: int
    roadmap_nodes: int
    roadmap_edges: int
    roadmap_block_map: int
    roadmap_rules: int
    block_progress: int
    subject_progress: int


def _count(session: Session, model: type[Any]) -> int:
    return int(session.exec(select(func.count()).select_from(model)).one() or 0)


def _counts(session: Session) -> BootstrapCounts:
    return BootstrapCounts(
        subjects=_count(session, Subject),
        blocks=_count(session, Block),
        block_subjects=_count(session, BlockSubject),
        roadmap_nodes=_count(session, RoadmapNode),
        roadmap_edges=_count(session, RoadmapEdge),
        roadmap_block_map=_count(session, RoadmapBlockMap),
        roadmap_rules=_count(session, RoadmapRule),
        block_progress=_count(session, BlockProgress),
        subject_progress=_count(session, SubjectProgress),
    )


def _capacity_snapshot(session: Session) -> dict[str, Any]:
    capacity = session.exec(select(StudyCapacity).order_by(StudyCapacity.id)).first()
    if capacity is None:
        return {
            "exists": False,
            "include_new_content": None,
            "max_focus_count": None,
            "max_questions": None,
            "daily_minutes": None,
            "notes": ["preferences ainda nao existem; o endpoint cria defaults quando chamado"],
        }
    return {
        "exists": True,
        "include_new_content": capacity.include_new_content,
        "include_reviews": capacity.include_reviews,
        "max_focus_count": capacity.max_focus_count,
        "max_questions": capacity.max_questions,
        "daily_minutes": capacity.daily_minutes,
        "intensity": capacity.intensity,
        "notes": [],
    }


def _study_plan_diagnostics(session: Session) -> dict[str, Any]:
    counts = _counts(session)
    capacity = _capacity_snapshot(session)
    focus_statuses = {"active", "ready_to_advance", "transition"}
    focus_blocks = session.exec(select(BlockProgress).where(BlockProgress.status.in_(focus_statuses))).all()
    available_subjects = session.exec(
        select(SubjectProgress).where(SubjectProgress.status.in_({"available", "in_progress"}))
    ).all()

    reasons: list[str] = []
    if counts.subjects == 0:
        reasons.append("sem subjects")
    if counts.blocks == 0:
        reasons.append("sem blocks")
    if counts.block_subjects == 0:
        reasons.append("sem block_subjects")
    if counts.block_progress == 0 or counts.subject_progress == 0:
        reasons.append("sem progressao sincronizada")
    if not focus_blocks:
        reasons.append("sem blocos de foco elegiveis")
    if not available_subjects:
        reasons.append("sem subjects available/in_progress")
    if capacity["exists"] and capacity["include_new_content"] is False:
        reasons.append("preferences include_new_content=false")
    if capacity["exists"] and int(capacity["max_focus_count"] or 0) <= 0:
        reasons.append("preferences max_focus_count zerado")
    if capacity["exists"] and int(capacity["max_questions"] or 0) <= 0:
        reasons.append("preferences max_questions zerado")

    return {
        "focus_blocks": len(focus_blocks),
        "available_subjects": len(available_subjects),
        "capacity": capacity,
        "empty_plan_reasons_if_any": reasons,
    }


def _ensure_sqlite() -> None:
    if not is_sqlite_database_url(DATABASE_URL):
        raise SystemExit(
            "Abortado: DATABASE_URL nao aponta para SQLite. "
            "Este bootstrap e exclusivo do SQLite local e nao toca Supabase/Postgres."
        )


def run_bootstrap(*, apply_changes: bool) -> dict[str, Any]:
    _ensure_sqlite()
    init_db()

    with Session(engine, expire_on_commit=False) as session:
        before = _counts(session)
        structural_summary = sync_structural_seed_into_session(session, apply_changes=apply_changes)
        roadmap_dry_run_before_apply = get_roadmap_dry_run(session)

        roadmap_import_summary = None
        progression_synced = False
        if apply_changes:
            roadmap_import_summary = import_roadmap_from_csv(session, delete_missing=False)
            sync_progression(session, date.today())
            progression_synced = True

        after = _counts(session)
        diagnostics = _study_plan_diagnostics(session)

    return {
        "mode": "apply" if apply_changes else "dry-run",
        "database": {
            "dialect": "sqlite",
            "target": get_database_target_display(),
        },
        "counts_before": asdict(before),
        "counts_after": asdict(after),
        "structural_seed": asdict(structural_summary),
        "roadmap_dry_run": roadmap_dry_run_before_apply.model_dump(),
        "roadmap_import": roadmap_import_summary.model_dump() if roadmap_import_summary is not None else None,
        "progression_synced": progression_synced,
        "study_plan_diagnostics": diagnostics,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Popula o SQLite local com dados estruturais versionados no repositorio."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Mostra o que seria sincronizado sem aplicar roadmap/progressao.")
    mode.add_argument("--apply", action="store_true", help="Aplica seed estrutural, roadmap e progressao minima no SQLite.")
    args = parser.parse_args()

    report = run_bootstrap(apply_changes=args.apply)
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
