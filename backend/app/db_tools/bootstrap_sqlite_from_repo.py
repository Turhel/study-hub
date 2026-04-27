from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

from sqlmodel import Session, select

from app.db import create_db_engine, get_database_backend, get_database_target_display, get_session, init_db
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
from app.services.capacity_service import get_or_create_capacity
from app.services.progression_service import sync_progression
from app.services.repo_seed_service import sync_structural_seed_into_session
from app.services.roadmap_import_service import import_roadmap_from_csv


@dataclass
class TableCounts:
    subjects: int
    blocks: int
    block_subjects: int
    roadmap_nodes: int
    roadmap_edges: int
    roadmap_block_map: int
    roadmap_rules: int
    block_progress: int
    subject_progress: int
    study_capacity: int


def _table_counts(session: Session) -> TableCounts:
    return TableCounts(
        subjects=len(session.exec(select(Subject)).all()),
        blocks=len(session.exec(select(Block)).all()),
        block_subjects=len(session.exec(select(BlockSubject)).all()),
        roadmap_nodes=len(session.exec(select(RoadmapNode)).all()),
        roadmap_edges=len(session.exec(select(RoadmapEdge)).all()),
        roadmap_block_map=len(session.exec(select(RoadmapBlockMap)).all()),
        roadmap_rules=len(session.exec(select(RoadmapRule)).all()),
        block_progress=len(session.exec(select(BlockProgress)).all()),
        subject_progress=len(session.exec(select(SubjectProgress)).all()),
        study_capacity=len(session.exec(select(StudyCapacity)).all()),
    )


def _build_report(session: Session, *, mode: str, target_database: str) -> dict[str, object]:
    before_counts = _table_counts(session)
    structural_summary = sync_structural_seed_into_session(session, apply_changes=True)
    roadmap_summary = import_roadmap_from_csv(session=session, delete_missing=False)
    capacity = get_or_create_capacity(session)
    block_progress, subject_progress = sync_progression(session, date.today())
    after_counts = _table_counts(session)

    return {
        "mode": mode,
        "database_backend": get_database_backend(),
        "target_database": target_database,
        "structural_seed": asdict(structural_summary),
        "roadmap": roadmap_summary.model_dump(),
        "progression": {
            "block_progress_rows": len(block_progress),
            "subject_progress_rows": len(subject_progress),
            "capacity_id": capacity.id,
        },
        "counts_before": asdict(before_counts),
        "counts_after": asdict(after_counts),
        "warnings": [
            "O bootstrap estrutural nao apaga subjects, blocks ou block_subjects existentes.",
            "O roadmap foi importado em modo preservacao, sem deletar rows extras do banco local.",
        ],
    }


def _sqlite_path() -> Path:
    target = Path(get_database_target_display())
    return target.resolve()


def _assert_sqlite_target() -> None:
    if get_database_backend() != "sqlite":
        raise SystemExit(
            "Este bootstrap foi feito para o SQLite local. Remova DATABASE_URL ou aponte o ambiente atual para sqlite."
        )


def _dry_run_report(target_path: Path) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="study_hub_sqlite_bootstrap_") as temp_dir:
        temp_db_path = Path(temp_dir) / "study_hub_dry_run.db"
        if target_path.exists():
            shutil.copy2(target_path, temp_db_path)

        temp_engine = create_db_engine(f"sqlite:///{temp_db_path.as_posix()}")
        try:
            init_db(temp_engine)
            with Session(temp_engine, expire_on_commit=False) as session:
                return _build_report(
                    session,
                    mode="dry-run",
                    target_database=str(target_path),
                )
        finally:
            temp_engine.dispose()


def _apply_report(target_path: Path) -> dict[str, object]:
    init_db()
    with get_session() as session:
        return _build_report(
            session,
            mode="apply",
            target_database=str(target_path),
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Popula o SQLite local com os CSVs estruturais versionados do repositório."
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--dry-run", action="store_true", help="Executa numa copia temporaria do SQLite local.")
    group.add_argument("--apply", action="store_true", help="Aplica a carga estrutural no SQLite local real.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    _assert_sqlite_target()
    target_path = _sqlite_path()

    if args.apply:
        report = _apply_report(target_path)
    else:
        report = _dry_run_report(target_path)

    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
