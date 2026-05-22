from __future__ import annotations

from sqlalchemy import inspect
from sqlalchemy import text
from sqlalchemy.engine import Connection


def _table_exists(connection: Connection, table_name: str) -> bool:
    inspector = inspect(connection)
    return table_name in inspector.get_table_names()


def _column_names(connection: Connection, table_name: str) -> set[str]:
    inspector = inspect(connection)
    return {column["name"] for column in inspector.get_columns(table_name)}


def _add_column_if_missing(connection: Connection, column_name: str, sql_type: str) -> None:
    if column_name in _column_names(connection, "mock_exams"):
        return
    connection.execute(text(f"ALTER TABLE mock_exams ADD COLUMN {column_name} {sql_type}"))


def apply(connection: Connection) -> None:
    if not _table_exists(connection, "mock_exams"):
        return

    timestamp_type = "TIMESTAMP" if connection.dialect.name == "postgresql" else "DATETIME"
    bool_type = "BOOLEAN" if connection.dialect.name == "postgresql" else "BOOLEAN"

    _add_column_if_missing(connection, "target_end_time", timestamp_type)
    _add_column_if_missing(connection, "is_paused", bool_type)
    _add_column_if_missing(connection, "paused_at", timestamp_type)

    connection.execute(
        text(
            """
            UPDATE mock_exams
            SET is_paused = COALESCE(is_paused, FALSE)
            """
        )
    )

    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_mock_exams_target_end_time ON mock_exams (target_end_time)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_mock_exams_is_paused ON mock_exams (is_paused)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_mock_exams_paused_at ON mock_exams (paused_at)"))
