from __future__ import annotations

from sqlalchemy import inspect
from sqlalchemy import text
from sqlalchemy.engine import Connection


def _table_exists(connection: Connection, table_name: str) -> bool:
    inspector = inspect(connection)
    return table_name in inspector.get_table_names()


def _column_exists(connection: Connection, table_name: str, column_name: str) -> bool:
    inspector = inspect(connection)
    columns = inspector.get_columns(table_name)
    return any(str(column.get("name")) == column_name for column in columns)


def _add_column_if_missing(connection: Connection, column_name: str, definition: str) -> None:
    if _column_exists(connection, "study_capacity", column_name):
        return
    connection.execute(text(f"ALTER TABLE study_capacity ADD COLUMN {column_name} {definition}"))


def apply(connection: Connection) -> None:
    if not _table_exists(connection, "study_capacity"):
        return

    _add_column_if_missing(connection, "daily_minutes", "INTEGER DEFAULT 90")
    _add_column_if_missing(connection, "intensity", "VARCHAR DEFAULT 'normal'")
    _add_column_if_missing(connection, "max_focus_count", "INTEGER DEFAULT 3")
    _add_column_if_missing(connection, "max_questions", "INTEGER DEFAULT 35")
    boolean_default = "BOOLEAN DEFAULT TRUE" if connection.dialect.name == "postgresql" else "BOOLEAN DEFAULT 1"
    _add_column_if_missing(connection, "include_reviews", boolean_default)
    _add_column_if_missing(connection, "include_new_content", boolean_default)
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_study_capacity_intensity ON study_capacity (intensity)"))
