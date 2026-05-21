from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import inspect
from sqlalchemy import text
from sqlalchemy.engine import Connection

_STUDY_TIMEZONE = ZoneInfo("America/Sao_Paulo")


def _table_exists(connection: Connection, table_name: str) -> bool:
    inspector = inspect(connection)
    return table_name in inspector.get_table_names()


def _column_exists(connection: Connection, table_name: str, column_name: str) -> bool:
    inspector = inspect(connection)
    columns = inspector.get_columns(table_name)
    return any(str(column.get("name")) == column_name for column in columns)


def _plan_date_from_created_at(created_at: object) -> date:
    if created_at is None:
        return datetime.now(_STUDY_TIMEZONE).date()
    if isinstance(created_at, date) and not isinstance(created_at, datetime):
        return created_at
    if isinstance(created_at, str):
        normalized = created_at.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    elif isinstance(created_at, datetime):
        parsed = created_at
    else:
        parsed = datetime.fromisoformat(str(created_at))

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(_STUDY_TIMEZONE).date()


def apply(connection: Connection) -> None:
    if not _table_exists(connection, "daily_study_plan"):
        return

    date_type = "DATE" if connection.dialect.name == "postgresql" else "DATE"
    if not _column_exists(connection, "daily_study_plan", "plan_date"):
        connection.execute(text(f"ALTER TABLE daily_study_plan ADD COLUMN plan_date {date_type}"))

    rows = connection.execute(
        text("SELECT id, created_at, plan_date FROM daily_study_plan")
    ).fetchall()

    for row in rows:
        row_id = row[0]
        created_at = row[1]
        existing_plan_date = row[2]
        if existing_plan_date is not None:
            continue
        plan_date = _plan_date_from_created_at(created_at)
        connection.execute(
            text("UPDATE daily_study_plan SET plan_date = :plan_date WHERE id = :row_id"),
            {"plan_date": plan_date.isoformat(), "row_id": row_id},
        )

    connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_daily_study_plan_plan_date ON daily_study_plan (plan_date)")
    )
