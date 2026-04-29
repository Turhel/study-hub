from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, select

from app.db import create_db_engine, init_db
from app.models import (
    Block,
    BlockMastery,
    BlockProgress,
    BlockSubject,
    DailyStudyPlan,
    DailyStudyPlanItem,
    Essay,
    EssayCorrection,
    EssayStudyMessage,
    EssayStudySession,
    EssaySubmission,
    LessonContent,
    MockExam,
    QuestionAttempt,
    Review,
    RoadmapBlockMap,
    RoadmapEdge,
    RoadmapNode,
    RoadmapRule,
    StudyCapacity,
    StudyEvent,
    Subject,
    SubjectProgress,
    TimerSession,
    TimerSessionItem,
)
from app.settings import get_database_url, get_default_sqlite_db_path, is_sqlite_database_url


@dataclass(frozen=True)
class TableSyncPlan:
    name: str
    model_cls: type[SQLModel]


@dataclass
class TableSyncResult:
    name: str
    source_count: int
    destination_before_count: int
    destination_after_count: int
    copied: int = 0
    skipped: bool = False
    warning: str | None = None


SYNC_PLANS: list[TableSyncPlan] = [
    TableSyncPlan("subjects", Subject),
    TableSyncPlan("blocks", Block),
    TableSyncPlan("block_subjects", BlockSubject),
    TableSyncPlan("roadmap_nodes", RoadmapNode),
    TableSyncPlan("roadmap_edges", RoadmapEdge),
    TableSyncPlan("roadmap_block_map", RoadmapBlockMap),
    TableSyncPlan("roadmap_rules", RoadmapRule),
    TableSyncPlan("study_capacity", StudyCapacity),
    TableSyncPlan("block_progress", BlockProgress),
    TableSyncPlan("subject_progress", SubjectProgress),
    TableSyncPlan("block_mastery", BlockMastery),
    TableSyncPlan("question_attempts", QuestionAttempt),
    TableSyncPlan("reviews", Review),
    TableSyncPlan("study_events", StudyEvent),
    TableSyncPlan("daily_study_plan", DailyStudyPlan),
    TableSyncPlan("daily_study_plan_items", DailyStudyPlanItem),
    TableSyncPlan("lesson_contents", LessonContent),
    TableSyncPlan("timer_sessions", TimerSession),
    TableSyncPlan("timer_session_items", TimerSessionItem),
    TableSyncPlan("mock_exams", MockExam),
    TableSyncPlan("essays", Essay),
    TableSyncPlan("essay_submissions", EssaySubmission),
    TableSyncPlan("essay_corrections", EssayCorrection),
    TableSyncPlan("essay_study_sessions", EssayStudySession),
    TableSyncPlan("essay_study_messages", EssayStudyMessage),
]

IGNORED_TABLES = {"schema_version"}


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _resolve_output_path(raw_path: str) -> Path:
    candidate = Path(raw_path)
    if candidate.is_absolute():
        return candidate
    return (_repo_root() / candidate).resolve()


def _mask_database_url(database_url: str) -> str:
    if "@" not in database_url or ":" not in database_url:
        return database_url
    head, tail = database_url.split("@", 1)
    if ":" not in head:
        return database_url
    prefix, _ = head.rsplit(":", 1)
    return f"{prefix}:***@{tail}"


def _ensure_remote_postgres(database_url: str) -> None:
    if not database_url.strip():
        raise SystemExit("Abortado: DATABASE_URL nao esta configurado.")
    if is_sqlite_database_url(database_url):
        raise SystemExit("Abortado: DATABASE_URL aponta para SQLite. Este comando exige Postgres/Supabase como origem.")


def _table_exists(engine: Engine, table_name: str) -> bool:
    return table_name in inspect(engine).get_table_names()


def _source_table_names(engine: Engine) -> list[str]:
    names = inspect(engine).get_table_names()
    return sorted(name for name in names if not name.startswith("sqlite_"))


def _count_rows(session: Session, table_name: str) -> int:
    row = session.exec(text(f"SELECT COUNT(*) FROM {table_name}")).one()
    if isinstance(row, tuple):
        return int(row[0])
    if hasattr(row, "__getitem__"):
        return int(row[0])
    return int(row)


def _count_destination(path: Path) -> dict[str, int]:
    if not path.exists():
        return {plan.name: 0 for plan in SYNC_PLANS}
    destination_engine = create_db_engine(f"sqlite:///{path.resolve().as_posix()}")
    try:
        with Session(destination_engine) as session:
            counts: dict[str, int] = {}
            for plan in SYNC_PLANS:
                counts[plan.name] = _count_rows(session, plan.name) if _table_exists(destination_engine, plan.name) else 0
            return counts
    finally:
        destination_engine.dispose()


def _backup_sqlite(path: Path) -> Path | None:
    if not path.exists():
        return None
    backups_dir = path.resolve().parents[1] / "backups"
    backups_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backups_dir / f"{path.stem}_{timestamp}{path.suffix}"
    shutil.copy2(path, backup_path)
    return backup_path


def _copy_table(source_session: Session, destination_session: Session, plan: TableSyncPlan) -> TableSyncResult:
    destination_before_count = _count_rows(destination_session, plan.name)
    if not _table_exists(source_session.get_bind(), plan.name):  # type: ignore[arg-type]
        return TableSyncResult(
            name=plan.name,
            source_count=0,
            destination_before_count=destination_before_count,
            destination_after_count=destination_before_count,
            skipped=True,
            warning="Tabela ausente na origem; sync ignorado com seguranca.",
        )

    source_rows = source_session.exec(select(plan.model_cls).order_by(plan.model_cls.id)).all()
    for row in source_rows:
        destination_session.add(plan.model_cls(**row.model_dump()))
    destination_session.commit()

    return TableSyncResult(
        name=plan.name,
        source_count=len(source_rows),
        destination_before_count=destination_before_count,
        destination_after_count=_count_rows(destination_session, plan.name),
        copied=len(source_rows),
    )


def _build_report(
    *,
    mode: str,
    source_database_url: str,
    output_path: Path,
    source_tables: list[str],
    ignored_source_tables: list[str],
    source_counts: dict[str, int],
    destination_counts_before: dict[str, int],
    destination_counts_after: dict[str, int] | None = None,
    backup_path: Path | None = None,
    synced_tables: list[TableSyncResult] | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "mode": mode,
        "source_database_url": _mask_database_url(source_database_url),
        "output_sqlite": str(output_path.resolve()),
        "backup_path": str(backup_path.resolve()) if backup_path is not None else None,
        "sync_tables": [plan.name for plan in SYNC_PLANS],
        "source_tables_detected": source_tables,
        "ignored_source_tables": ignored_source_tables,
        "source_counts": source_counts,
        "destination_counts_before": destination_counts_before,
        "destination_counts_after": destination_counts_after or {},
        "synced_tables": [asdict(item) for item in (synced_tables or [])],
        "warnings": warnings or [],
    }


def run_sync(*, output_path: Path, apply: bool) -> dict[str, Any]:
    source_database_url = get_database_url()
    _ensure_remote_postgres(source_database_url)

    source_engine = create_db_engine(source_database_url)
    try:
        source_tables = _source_table_names(source_engine)
        ignored_source_tables = sorted(
            name for name in source_tables if name in IGNORED_TABLES or name not in {plan.name for plan in SYNC_PLANS}
        )

        with Session(source_engine, expire_on_commit=False) as source_session:
            source_counts = {
                plan.name: _count_rows(source_session, plan.name)
                for plan in SYNC_PLANS
                if _table_exists(source_engine, plan.name)
            }

        destination_counts_before = _count_destination(output_path)
        warnings = [
            f"Tabela ausente na origem: {plan.name}"
            for plan in SYNC_PLANS
            if not _table_exists(source_engine, plan.name)
        ]

        if not apply:
            return _build_report(
                mode="dry-run",
                source_database_url=source_database_url,
                output_path=output_path,
                source_tables=source_tables,
                ignored_source_tables=ignored_source_tables,
                source_counts=source_counts,
                destination_counts_before=destination_counts_before,
                warnings=warnings,
            )

        output_path.parent.mkdir(parents=True, exist_ok=True)
        backup_path = _backup_sqlite(output_path)

        with tempfile.TemporaryDirectory(prefix="study_hub_remote_snapshot_") as temp_dir:
            temp_output = Path(temp_dir) / output_path.name
            destination_engine = create_db_engine(f"sqlite:///{temp_output.resolve().as_posix()}")
            try:
                init_db(destination_engine)
                synced_tables: list[TableSyncResult] = []
                with Session(source_engine, expire_on_commit=False) as source_session, Session(
                    destination_engine, expire_on_commit=False
                ) as destination_session:
                    for plan in SYNC_PLANS:
                        synced_tables.append(_copy_table(source_session, destination_session, plan))

                destination_counts_after = _count_destination(temp_output)
            finally:
                destination_engine.dispose()

            shutil.move(str(temp_output), str(output_path))

        return _build_report(
            mode="apply",
            source_database_url=source_database_url,
            output_path=output_path,
            source_tables=source_tables,
            ignored_source_tables=ignored_source_tables,
            source_counts=source_counts,
            destination_counts_before=destination_counts_before,
            destination_counts_after=destination_counts_after,
            backup_path=backup_path,
            synced_tables=synced_tables,
            warnings=warnings,
        )
    finally:
        source_engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Baixa um snapshot do Postgres/Supabase para um SQLite local de uso offline."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Consulta a origem remota e mostra contagens sem escrever.")
    mode.add_argument("--apply", action="store_true", help="Cria um snapshot SQLite local a partir do Postgres remoto.")
    parser.add_argument(
        "--output",
        default=str(get_default_sqlite_db_path()),
        help="Caminho do SQLite de destino. Default: backend/data/study_hub.db",
    )
    args = parser.parse_args()

    report = run_sync(output_path=_resolve_output_path(args.output), apply=args.apply)
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
