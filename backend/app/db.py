from __future__ import annotations

from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.engine import Engine

from app.db_migrations.runner import run_migrations
from app.settings import (
    get_database_url,
    get_db_echo,
    get_default_sqlite_db_path,
    is_sqlite_database_url,
)

DB_PATH = get_default_sqlite_db_path()
DATABASE_URL = get_database_url()


def create_db_engine(database_url: str | None = None) -> Engine:
    resolved_url = (database_url or get_database_url()).strip()
    engine_kwargs: dict[str, object] = {
        "echo": get_db_echo(),
        "pool_pre_ping": not is_sqlite_database_url(resolved_url),
    }
    if is_sqlite_database_url(resolved_url):
        engine_kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(resolved_url, **engine_kwargs)


engine = create_db_engine(DATABASE_URL)


def init_db() -> None:
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    run_migrations(engine)


def get_session() -> Session:
    return Session(engine)
