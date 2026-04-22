from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection


def _table_exists(connection: Connection, table_name: str) -> bool:
    result = connection.execute(
        text("SELECT name FROM sqlite_master WHERE type = 'table' AND name = :table_name"),
        {"table_name": table_name},
    ).first()
    return result is not None


def _column_exists(connection: Connection, table_name: str, column_name: str) -> bool:
    columns = connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    return any(row[1] == column_name for row in columns)


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
