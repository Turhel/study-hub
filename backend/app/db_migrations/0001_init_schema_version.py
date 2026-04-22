from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection


def apply(connection: Connection) -> None:
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS schema_version (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                version INTEGER NOT NULL,
                applied_at TEXT NOT NULL
            )
            """
        )
    )
