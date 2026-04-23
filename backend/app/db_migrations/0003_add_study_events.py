from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection


def apply(connection: Connection) -> None:
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS study_events (
                id INTEGER PRIMARY KEY,
                event_type VARCHAR NOT NULL,
                created_at DATETIME NOT NULL,
                discipline VARCHAR,
                strategic_discipline VARCHAR,
                subarea VARCHAR,
                block_id INTEGER,
                subject_id INTEGER,
                title VARCHAR NOT NULL,
                description VARCHAR NOT NULL,
                metadata_json VARCHAR NOT NULL DEFAULT '{}',
                FOREIGN KEY(block_id) REFERENCES blocks(id),
                FOREIGN KEY(subject_id) REFERENCES subjects(id)
            )
            """
        )
    )
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_study_events_event_type ON study_events (event_type)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_study_events_created_at ON study_events (created_at)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_study_events_discipline ON study_events (discipline)"))
    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_study_events_strategic_discipline ON study_events (strategic_discipline)")
    )
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_study_events_subarea ON study_events (subarea)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_study_events_block_id ON study_events (block_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_study_events_subject_id ON study_events (subject_id)"))
