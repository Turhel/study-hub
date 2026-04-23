from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.db import create_db_engine, engine as target_engine, get_session, init_db
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
    StudyCapacity,
    StudyEvent,
    Subject,
    SubjectProgress,
    TimerSession,
    TimerSessionItem,
)
from app.services.roadmap_import_service import import_roadmap_from_csv
from app.services.repo_seed_service import load_structural_seed_rows


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


@dataclass
class PostgresUsageBootstrapSummary:
    source_sqlite_path: str
    target_database_url: str
    question_attempts_created: int = 0
    question_attempts_updated: int = 0
    reviews_created: int = 0
    reviews_updated: int = 0
    block_mastery_created: int = 0
    block_mastery_updated: int = 0
    block_progress_created: int = 0
    block_progress_updated: int = 0
    subject_progress_created: int = 0
    subject_progress_updated: int = 0
    study_capacity_created: int = 0
    study_capacity_updated: int = 0
    study_events_created: int = 0
    study_events_updated: int = 0
    daily_study_plan_created: int = 0
    daily_study_plan_updated: int = 0
    daily_study_plan_items_created: int = 0
    daily_study_plan_items_updated: int = 0
    timer_sessions_created: int = 0
    timer_sessions_updated: int = 0
    timer_session_items_created: int = 0
    timer_session_items_updated: int = 0
    mock_exams_created: int = 0
    mock_exams_updated: int = 0
    essays_created: int = 0
    essays_updated: int = 0
    essay_submissions_created: int = 0
    essay_submissions_updated: int = 0
    essay_corrections_created: int = 0
    essay_corrections_updated: int = 0
    essay_study_sessions_created: int = 0
    essay_study_sessions_updated: int = 0
    essay_study_messages_created: int = 0
    essay_study_messages_updated: int = 0


def _sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def _copy_table_by_id[T](
    source_session: Session,
    target_session: Session,
    model_cls: type[T],
    alternate_unique_fields: tuple[str, ...] = (),
) -> tuple[int, int]:
    source_rows = source_session.exec(select(model_cls).order_by(model_cls.id)).all()
    target_rows = {row.id: row for row in target_session.exec(select(model_cls)).all()}
    target_rows_by_alt_key = {
        tuple(getattr(row, field_name) for field_name in alternate_unique_fields): row
        for row in target_rows.values()
        if alternate_unique_fields
    }

    created = 0
    updated = 0

    for source_row in source_rows:
        payload = source_row.model_dump()
        matched_by_alternate_key = False
        target_row = None
        if alternate_unique_fields:
            alt_key = tuple(payload[field_name] for field_name in alternate_unique_fields)
            target_row = target_rows_by_alt_key.get(alt_key)
            matched_by_alternate_key = target_row is not None
        if target_row is None:
            target_row = target_rows.get(source_row.id)
        if target_row is None:
            target_session.add(model_cls(**payload))
            created += 1
            continue

        for field_name, value in payload.items():
            if matched_by_alternate_key and field_name == "id":
                continue
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


def _masked_target_database_url() -> str:
    return (
        str(target_engine.url).replace(target_engine.url.password or "", "***")
        if target_engine.url.password
        else str(target_engine.url)
    )


def _parse_bool(value: str) -> bool:
    return value.strip().casefold() in {"1", "true", "sim", "yes", "on"}


def bootstrap_structural_data_to_postgres(source_sqlite_path: Path) -> PostgresStructuralBootstrapSummary:
    source_path = source_sqlite_path.resolve()
    _validate_target_is_postgres(target_engine)
    init_db()

    summary = PostgresStructuralBootstrapSummary(
        source_sqlite_path=str(source_path),
        target_database_url=_masked_target_database_url(),
    )

    seed_rows = load_structural_seed_rows()

    with get_session() as target_session:
        subject_source_rows = seed_rows["subjects"]
        target_subjects = {row.id: row for row in target_session.exec(select(Subject)).all()}
        for row in subject_source_rows:
            payload = dict(
                id=int(row["id"]),
                disciplina=row["disciplina"],
                assunto=row["assunto"],
                subassunto=row["subassunto"] or None,
                competencia=row["competencia"] or None,
                habilidade=row["habilidade"] or None,
                prioridade_enem=int(row["prioridade_enem"] or 3),
                ativo=_parse_bool(row["ativo"]),
            )
            target_row = target_subjects.get(payload["id"])
            if target_row is None:
                target_session.add(Subject(**payload))
                summary.subjects_created += 1
            else:
                for field_name, value in payload.items():
                    setattr(target_row, field_name, value)
                target_session.add(target_row)
                summary.subjects_updated += 1

        block_source_rows = seed_rows["blocks"]
        target_blocks = {row.id: row for row in target_session.exec(select(Block)).all()}
        for row in block_source_rows:
            payload = dict(
                id=int(row["id"]),
                nome=row["nome"],
                disciplina=row["disciplina"],
                descricao=row["descricao"] or None,
                ordem=int(row["ordem"] or 0),
                status=row["status"] or "em_andamento",
            )
            target_row = target_blocks.get(payload["id"])
            if target_row is None:
                target_session.add(Block(**payload))
                summary.blocks_created += 1
            else:
                for field_name, value in payload.items():
                    setattr(target_row, field_name, value)
                target_session.add(target_row)
                summary.blocks_updated += 1

        block_subject_source_rows = seed_rows["block_subjects"]
        target_block_subjects = {row.id: row for row in target_session.exec(select(BlockSubject)).all()}
        for row in block_subject_source_rows:
            payload = dict(
                id=int(row["id"]),
                block_id=int(row["block_id"]),
                subject_id=int(row["subject_id"]),
            )
            target_row = target_block_subjects.get(payload["id"])
            if target_row is None:
                target_session.add(BlockSubject(**payload))
                summary.block_subjects_created += 1
            else:
                for field_name, value in payload.items():
                    setattr(target_row, field_name, value)
                target_session.add(target_row)
                summary.block_subjects_updated += 1
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


def bootstrap_usage_data_to_postgres(source_sqlite_path: Path) -> PostgresUsageBootstrapSummary:
    source_path = source_sqlite_path.resolve()
    if not source_path.exists():
        raise FileNotFoundError(f"SQLite de origem nao encontrado: {source_path}")

    _validate_target_is_postgres(target_engine)
    init_db()

    summary = PostgresUsageBootstrapSummary(
        source_sqlite_path=str(source_path),
        target_database_url=_masked_target_database_url(),
    )

    table_models: list[tuple[str, type, tuple[str, ...]]] = [
        ("question_attempts", QuestionAttempt, ()),
        ("reviews", Review, ()),
        ("block_mastery", BlockMastery, ("block_id",)),
        ("block_progress", BlockProgress, ("block_id",)),
        ("subject_progress", SubjectProgress, ("subject_id",)),
        ("study_capacity", StudyCapacity, ()),
        ("study_events", StudyEvent, ()),
        ("daily_study_plan", DailyStudyPlan, ()),
        ("daily_study_plan_items", DailyStudyPlanItem, ()),
        ("timer_sessions", TimerSession, ()),
        ("timer_session_items", TimerSessionItem, ()),
        ("mock_exams", MockExam, ()),
        ("essays", Essay, ()),
        ("essay_submissions", EssaySubmission, ()),
        ("essay_corrections", EssayCorrection, ()),
        ("essay_study_sessions", EssayStudySession, ()),
        ("essay_study_messages", EssayStudyMessage, ()),
    ]

    source_engine = create_db_engine(_sqlite_url(source_path))

    with Session(source_engine) as source_session, get_session() as target_session:
        for table_name, model_cls, alternate_unique_fields in table_models:
            created, updated = _copy_table_by_id(
                source_session,
                target_session,
                model_cls,
                alternate_unique_fields=alternate_unique_fields,
            )
            setattr(summary, f"{table_name}_created", created)
            setattr(summary, f"{table_name}_updated", updated)
        target_session.commit()

        for table_name, _, _ in table_models:
            _sync_postgres_sequence(target_session, table_name)
        target_session.commit()

    return summary
