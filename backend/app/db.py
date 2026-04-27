from __future__ import annotations

from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.engine import Engine

from app.db_migrations.runner import run_migrations
from app.settings import (
    get_database_backend_label,
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


def init_db(engine_override: Engine | None = None) -> None:
    from app import models  # noqa: F401

    active_engine = engine_override or engine
    SQLModel.metadata.create_all(active_engine)
    run_migrations(active_engine)


def get_session() -> Session:
    return Session(engine, expire_on_commit=False)


def get_database_backend() -> str:
    return get_database_backend_label(DATABASE_URL)


def get_database_target_display() -> str:
    if is_sqlite_database_url(DATABASE_URL):
        return str(DB_PATH)
    rendered = str(engine.url)
    password = engine.url.password or ""
    if password:
        rendered = rendered.replace(password, "***")
    return rendered
