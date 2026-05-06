from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import inspect
from sqlalchemy import text
from sqlalchemy.engine import Connection


def _column_names(connection: Connection, table_name: str) -> set[str]:
    inspector = inspect(connection)
    return {column["name"] for column in inspector.get_columns(table_name)}


def _add_column_if_missing(connection: Connection, column_name: str, sql_type: str) -> None:
    if column_name in _column_names(connection, "mock_exams"):
        return
    connection.execute(text(f"ALTER TABLE mock_exams ADD COLUMN {column_name} {sql_type}"))


def apply(connection: Connection) -> None:
    inspector = inspect(connection)
    if "mock_exams" not in inspector.get_table_names():
        return

    timestamp_type = "TIMESTAMP" if connection.dialect.name == "postgresql" else "DATETIME"
    _add_column_if_missing(connection, "tri_score", "FLOAT")
    _add_column_if_missing(connection, "created_at", timestamp_type)
    _add_column_if_missing(connection, "updated_at", timestamp_type)

    now_iso = datetime.now(timezone.utc).replace(tzinfo=None).isoformat(sep=" ")
    connection.execute(
        text(
            """
            UPDATE mock_exams
            SET created_at = COALESCE(created_at, :now_value),
                updated_at = COALESCE(updated_at, :now_value)
            """
        ),
        {"now_value": now_iso},
    )
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_mock_exams_created_at ON mock_exams (created_at)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_mock_exams_updated_at ON mock_exams (updated_at)"))
