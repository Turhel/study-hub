from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.db import create_db_engine, engine as target_engine, get_session, init_db
from app.models import Block, BlockSubject, Subject
from app.services.roadmap_import_service import import_roadmap_from_csv


@dataclass
class PostgresStructuralBootstrapSummary:
    source_sqlite_path: str
    target_database_url: str
    subjects_created: int = 0
    subjects_updated: int = 0
    blocks_created: int = 0
    blocks_updated: int = 0
    block_subjects_created: int = 0
    block_subjects_updated: int = 0
    roadmap_nodes_created: int = 0
    roadmap_nodes_updated: int = 0
    roadmap_edges_created: int = 0
    roadmap_edges_updated: int = 0
    roadmap_block_map_created: int = 0
    roadmap_block_map_updated: int = 0
    roadmap_rules_created: int = 0
    roadmap_rules_updated: int = 0


def _sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def _copy_table_by_id[T](source_session: Session, target_session: Session, model_cls: type[T]) -> tuple[int, int]:
    source_rows = source_session.exec(select(model_cls).order_by(model_cls.id)).all()
    target_rows = {row.id: row for row in target_session.exec(select(model_cls)).all()}

    created = 0
    updated = 0

    for source_row in source_rows:
        target_row = target_rows.get(source_row.id)
        payload = source_row.model_dump()
        if target_row is None:
            target_session.add(model_cls(**payload))
            created += 1
            continue

        for field_name, value in payload.items():
            setattr(target_row, field_name, value)
        target_session.add(target_row)
        updated += 1

    return created, updated


def _sync_postgres_sequence(target_session: Session, table_name: str) -> None:
    bind = target_session.get_bind()
    if bind is None or bind.dialect.name != "postgresql":
        return

    max_id_row = target_session.exec(text(f"SELECT COALESCE(MAX(id), 0) FROM {table_name}")).one()
    max_id = int(max_id_row[0])
    next_value = max_id if max_id > 0 else 1
    target_session.connection().execute(
        text(
            "SELECT setval(pg_get_serial_sequence(:table_name, 'id'), :next_value, :is_called)"
        ),
        {
            "table_name": table_name,
            "next_value": next_value,
            "is_called": next_value > 0,
        },
    )


def _validate_target_is_postgres(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        raise ValueError("Bootstrap estrutural exige target Postgres via DATABASE_URL.")


def bootstrap_structural_data_to_postgres(source_sqlite_path: Path) -> PostgresStructuralBootstrapSummary:
    source_path = source_sqlite_path.resolve()
    if not source_path.exists():
        raise FileNotFoundError(f"SQLite de origem nao encontrado: {source_path}")

    _validate_target_is_postgres(target_engine)
    init_db()

    summary = PostgresStructuralBootstrapSummary(
        source_sqlite_path=str(source_path),
        target_database_url=str(target_engine.url).replace(target_engine.url.password or "", "***")
        if target_engine.url.password
        else str(target_engine.url),
    )

    source_engine = create_db_engine(_sqlite_url(source_path))

    with Session(source_engine) as source_session, get_session() as target_session:
        summary.subjects_created, summary.subjects_updated = _copy_table_by_id(source_session, target_session, Subject)
        summary.blocks_created, summary.blocks_updated = _copy_table_by_id(source_session, target_session, Block)
        summary.block_subjects_created, summary.block_subjects_updated = _copy_table_by_id(
            source_session, target_session, BlockSubject
        )
        target_session.commit()

        _sync_postgres_sequence(target_session, "subjects")
        _sync_postgres_sequence(target_session, "blocks")
        _sync_postgres_sequence(target_session, "block_subjects")
        target_session.commit()

        roadmap_summary = import_roadmap_from_csv(session=target_session)
        target_session.commit()

    summary.roadmap_nodes_created = roadmap_summary.nodes_created
    summary.roadmap_nodes_updated = roadmap_summary.nodes_updated
    summary.roadmap_edges_created = roadmap_summary.edges_created
    summary.roadmap_edges_updated = roadmap_summary.edges_updated
    summary.roadmap_block_map_created = roadmap_summary.block_map_created
    summary.roadmap_block_map_updated = roadmap_summary.block_map_updated
    summary.roadmap_rules_created = roadmap_summary.rules_created
    summary.roadmap_rules_updated = roadmap_summary.rules_updated
    return summary
