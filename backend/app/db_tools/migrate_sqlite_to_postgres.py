from __future__ import annotations

import argparse
import json
import os
import shutil
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


ALLOW_REMOTE_MIGRATION_ENV = "STUDY_HUB_ALLOW_REMOTE_MIGRATION"


@dataclass(frozen=True)
class TableMigrationPlan:
    name: str
    model_cls: type[SQLModel]
    preserve_ids: bool = True


@dataclass
class TableMigrationResult:
    name: str
    source_count: int
    target_before_count: int
    target_after_count: int
    inserted: int = 0
    updated: int = 0
    skipped: bool = False
    reason: str | None = None


MIGRATION_PLANS: list[TableMigrationPlan] = [
    TableMigrationPlan("subjects", Subject),
    TableMigrationPlan("blocks", Block),
    TableMigrationPlan("block_subjects", BlockSubject),
    TableMigrationPlan("roadmap_nodes", RoadmapNode),
    TableMigrationPlan("roadmap_edges", RoadmapEdge),
    TableMigrationPlan("roadmap_block_map", RoadmapBlockMap),
    TableMigrationPlan("roadmap_rules", RoadmapRule),
    TableMigrationPlan("study_capacity", StudyCapacity),
    TableMigrationPlan("block_progress", BlockProgress),
    TableMigrationPlan("subject_progress", SubjectProgress),
    TableMigrationPlan("block_mastery", BlockMastery),
    TableMigrationPlan("question_attempts", QuestionAttempt),
    TableMigrationPlan("reviews", Review),
    TableMigrationPlan("study_events", StudyEvent),
    TableMigrationPlan("daily_study_plan", DailyStudyPlan),
    TableMigrationPlan("daily_study_plan_items", DailyStudyPlanItem),
    TableMigrationPlan("timer_sessions", TimerSession),
    TableMigrationPlan("timer_session_items", TimerSessionItem),
    TableMigrationPlan("mock_exams", MockExam),
    TableMigrationPlan("essays", Essay),
    TableMigrationPlan("essay_submissions", EssaySubmission),
    TableMigrationPlan("essay_corrections", EssayCorrection),
    TableMigrationPlan("essay_study_sessions", EssayStudySession),
    TableMigrationPlan("essay_study_messages", EssayStudyMessage),
]

EXCLUDED_SOURCE_TABLES = {"schema_version"}


def _mask_database_url(database_url: str) -> str:
    if "@" not in database_url or ":" not in database_url:
        return database_url
    head, tail = database_url.split("@", 1)
    if ":" not in head:
        return database_url
    prefix, _ = head.rsplit(":", 1)
    return f"{prefix}:***@{tail}"


def _table_exists(engine: Engine, table_name: str) -> bool:
    return table_name in inspect(engine).get_table_names()


def _source_table_names(engine: Engine) -> list[str]:
    names = inspect(engine).get_table_names()
    return sorted(name for name in names if not name.startswith("sqlite_"))


def _count_rows(session: Session, table_name: str) -> int:
    row = session.exec(text(f"SELECT COUNT(*) FROM {table_name}")).one()
    return int(row[0])


def _count_all(session: Session) -> dict[str, int]:
    counts: dict[str, int] = {}
    for plan in MIGRATION_PLANS:
        if _table_exists(session.get_bind(), plan.name):  # type: ignore[arg-type]
            counts[plan.name] = _count_rows(session, plan.name)
    return counts


def _sync_postgres_sequence(session: Session, table_name: str) -> None:
    bind = session.get_bind()
    if bind is None or bind.dialect.name != "postgresql":
        return
    max_id_row = session.exec(text(f"SELECT COALESCE(MAX(id), 0) FROM {table_name}")).one()
    max_id = int(max_id_row[0])
    next_value = max_id if max_id > 0 else 1
    session.connection().execute(
        text("SELECT setval(pg_get_serial_sequence(:table_name, 'id'), :next_value, :is_called)"),
        {
            "table_name": table_name,
            "next_value": next_value,
            "is_called": next_value > 0,
        },
    )


def _backup_sqlite(source_sqlite_path: Path) -> Path:
    backups_dir = source_sqlite_path.resolve().parents[1] / "backups"
    backups_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backups_dir / f"{source_sqlite_path.stem}_{timestamp}{source_sqlite_path.suffix}"
    shutil.copy2(source_sqlite_path, backup_path)
    return backup_path


def _delete_target_rows(session: Session) -> None:
    table_names = [plan.name for plan in MIGRATION_PLANS if _table_exists(session.get_bind(), plan.name)]  # type: ignore[arg-type]
    if not table_names:
        return
    quoted = ", ".join(table_names)
    session.connection().execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))
    session.commit()


def _copy_table_by_id(
    source_session: Session,
    target_session: Session,
    plan: TableMigrationPlan,
) -> TableMigrationResult:
    source_exists = _table_exists(source_session.get_bind(), plan.name)  # type: ignore[arg-type]
    target_exists = _table_exists(target_session.get_bind(), plan.name)  # type: ignore[arg-type]

    if not source_exists:
        return TableMigrationResult(
            name=plan.name,
            source_count=0,
            target_before_count=_count_rows(target_session, plan.name) if target_exists else 0,
            target_after_count=_count_rows(target_session, plan.name) if target_exists else 0,
            skipped=True,
            reason="Tabela nao existe na origem.",
        )

    if not target_exists:
        return TableMigrationResult(
            name=plan.name,
            source_count=_count_rows(source_session, plan.name),
            target_before_count=0,
            target_after_count=0,
            skipped=True,
            reason="Tabela nao existe no destino.",
        )

    source_rows = source_session.exec(select(plan.model_cls).order_by(plan.model_cls.id)).all()
    target_rows = {
        row.id: row
        for row in target_session.exec(select(plan.model_cls)).all()
        if getattr(row, "id", None) is not None
    }

    result = TableMigrationResult(
        name=plan.name,
        source_count=len(source_rows),
        target_before_count=len(target_rows),
        target_after_count=0,
    )

    for source_row in source_rows:
        payload = source_row.model_dump()
        target_row = target_rows.get(source_row.id)
        if target_row is None:
            target_session.add(plan.model_cls(**payload))
            result.inserted += 1
            continue

        for field_name, value in payload.items():
            setattr(target_row, field_name, value)
        target_session.add(target_row)
        result.updated += 1

    target_session.commit()
    _sync_postgres_sequence(target_session, plan.name)
    target_session.commit()
    result.target_after_count = _count_rows(target_session, plan.name)
    return result


def _validate_target_is_postgres(target_database_url: str) -> None:
    if is_sqlite_database_url(target_database_url):
        raise ValueError("O destino remoto precisa ser Postgres. DATABASE_URL atual aponta para SQLite.")


def _validate_apply_guardrails(apply: bool) -> None:
    if not apply:
        return
    if os.getenv(ALLOW_REMOTE_MIGRATION_ENV, "").strip().lower() not in {"1", "true", "yes", "on"}:
        raise ValueError(
            f"Aplicacao remota bloqueada. Defina {ALLOW_REMOTE_MIGRATION_ENV}=true e use --apply."
        )


def _schema_checks(engine: Engine) -> dict[str, Any]:
    inspector = inspect(engine)
    checks: dict[str, Any] = {
        "schema_version_exists": "schema_version" in inspector.get_table_names(),
        "study_events_exists": "study_events" in inspector.get_table_names(),
        "block_progress_has_user_decision": False,
        "schema_version_rows": [],
    }
    if "block_progress" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("block_progress")}
        checks["block_progress_has_user_decision"] = "user_decision" in columns
    if checks["schema_version_exists"]:
        with engine.connect() as connection:
            checks["schema_version_rows"] = [
                list(row) for row in connection.execute(text("SELECT id, version, applied_at FROM schema_version"))
            ]
    return checks


def _build_report(
    *,
    mode: str,
    source_sqlite_path: Path,
    target_database_url: str,
    source_tables: list[str],
    ignored_tables: list[str],
    source_counts: dict[str, int],
    target_counts_before: dict[str, int],
    target_counts_after: dict[str, int] | None = None,
    backup_path: Path | None = None,
    reset_target: bool = False,
    migrated_tables: list[TableMigrationResult] | None = None,
    schema_checks: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "mode": mode,
        "source_sqlite_path": str(source_sqlite_path.resolve()),
        "target_database_url": _mask_database_url(target_database_url),
        "reset_target": reset_target,
        "backup_path": str(backup_path.resolve()) if backup_path is not None else None,
        "source_tables_detected": source_tables,
        "ignored_tables": ignored_tables,
        "source_counts": source_counts,
        "target_counts_before": target_counts_before,
        "target_counts_after": target_counts_after or {},
        "migrated_tables": [asdict(item) for item in (migrated_tables or [])],
        "schema_checks": schema_checks or {},
    }


def run_migration(
    *,
    source_sqlite_path: Path,
    apply: bool,
    reset_target: bool,
) -> dict[str, Any]:
    if not source_sqlite_path.exists():
        raise FileNotFoundError(f"SQLite de origem nao encontrado: {source_sqlite_path.resolve()}")

    _validate_apply_guardrails(apply)

    target_database_url = get_database_url()
    _validate_target_is_postgres(target_database_url)

    source_engine = create_db_engine(f"sqlite:///{source_sqlite_path.resolve().as_posix()}")
    target_engine = create_db_engine(target_database_url)

    source_tables = _source_table_names(source_engine)
    ignored_tables = sorted(
        name
        for name in source_tables
        if name in EXCLUDED_SOURCE_TABLES or name not in {plan.name for plan in MIGRATION_PLANS}
    )

    with Session(source_engine) as source_session, Session(target_engine, expire_on_commit=False) as target_session:
        source_counts = {
            plan.name: _count_rows(source_session, plan.name)
            for plan in MIGRATION_PLANS
            if plan.name in source_tables
        }
        target_counts_before = _count_all(target_session)

        if not apply:
            return _build_report(
                mode="dry-run",
                source_sqlite_path=source_sqlite_path,
                target_database_url=target_database_url,
                source_tables=source_tables,
                ignored_tables=ignored_tables,
                source_counts=source_counts,
                target_counts_before=target_counts_before,
                schema_checks=_schema_checks(target_engine),
            )

    backup_path = _backup_sqlite(source_sqlite_path)
    init_db()

    migrated_tables: list[TableMigrationResult] = []
    with Session(source_engine) as source_session, Session(target_engine, expire_on_commit=False) as target_session:
        if reset_target:
            _delete_target_rows(target_session)

        for plan in MIGRATION_PLANS:
            migrated_tables.append(_copy_table_by_id(source_session, target_session, plan))

        target_counts_after = _count_all(target_session)

    return _build_report(
        mode="apply",
        source_sqlite_path=source_sqlite_path,
        target_database_url=target_database_url,
        source_tables=source_tables,
        ignored_tables=ignored_tables,
        source_counts=source_counts,
        target_counts_before=target_counts_before,
        target_counts_after=target_counts_after,
        backup_path=backup_path,
        reset_target=reset_target,
        migrated_tables=migrated_tables,
        schema_checks=_schema_checks(target_engine),
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migra dados reais do SQLite oficial para o Postgres configurado em DATABASE_URL."
    )
    parser.add_argument(
        "--source-sqlite",
        default=str(get_default_sqlite_db_path()),
        help="Caminho para o SQLite oficial de origem.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Mostra o que seria migrado sem escrever no Postgres.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Aplica a migracao real. Exige tambem a env STUDY_HUB_ALLOW_REMOTE_MIGRATION=true.",
    )
    parser.add_argument(
        "--reset-target",
        action="store_true",
        help="Limpa explicitamente as tabelas migraveis do Postgres antes de importar.",
    )
    args = parser.parse_args()

    if args.dry_run == args.apply:
        parser.error("Use exatamente um entre --dry-run e --apply.")
    if args.reset_target and not args.apply:
        parser.error("--reset-target so pode ser usado junto com --apply.")

    report = run_migration(
        source_sqlite_path=Path(args.source_sqlite),
        apply=args.apply,
        reset_target=args.reset_target,
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
