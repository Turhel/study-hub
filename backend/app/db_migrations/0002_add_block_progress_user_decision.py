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


def apply(connection: Connection) -> None:
    if not _table_exists(connection, "block_progress"):
        return
    if _column_exists(connection, "block_progress", "user_decision"):
        return

    connection.execute(
        text(
            "ALTER TABLE block_progress "
            "ADD COLUMN user_decision VARCHAR DEFAULT 'continue_current'"
        )
    )
