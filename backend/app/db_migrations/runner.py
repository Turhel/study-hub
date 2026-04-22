from __future__ import annotations

import importlib
import pkgutil
from datetime import datetime
from types import ModuleType

from sqlalchemy import text
from sqlalchemy.engine import Engine

import app.db_migrations as migrations_package


MIGRATION_PREFIX_LENGTH = 4


class MigrationError(RuntimeError):
    pass


def _schema_version_table_exists(engine: Engine) -> bool:
    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'")
        ).first()
        return result is not None


def _current_version(engine: Engine) -> int:
    if not _schema_version_table_exists(engine):
        return 0

    with engine.connect() as connection:
        row = connection.execute(text("SELECT version FROM schema_version WHERE id = 1")).first()
        return int(row[0]) if row is not None else 0


def _record_version(engine: Engine, version: int) -> None:
    applied_at = datetime.utcnow().isoformat()
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO schema_version (id, version, applied_at)
                VALUES (1, :version, :applied_at)
                ON CONFLICT(id) DO UPDATE SET
                    version = excluded.version,
                    applied_at = excluded.applied_at
                """
            ),
            {"version": version, "applied_at": applied_at},
        )


def _migration_version(module_name: str) -> int | None:
    prefix = module_name[:MIGRATION_PREFIX_LENGTH]
    if len(prefix) != MIGRATION_PREFIX_LENGTH or not prefix.isdigit():
        return None
    return int(prefix)


def _load_migrations() -> list[tuple[int, ModuleType]]:
    migrations: list[tuple[int, ModuleType]] = []
    for module_info in pkgutil.iter_modules(migrations_package.__path__):
        version = _migration_version(module_info.name)
        if version is None:
            continue
        module = importlib.import_module(f"{migrations_package.__name__}.{module_info.name}")
        if not hasattr(module, "apply"):
            raise MigrationError(f"Migracao sem funcao apply: {module_info.name}")
        migrations.append((version, module))

    versions = [version for version, _ in migrations]
    if len(versions) != len(set(versions)):
        raise MigrationError("Existem migracoes com versao duplicada.")

    return sorted(migrations, key=lambda item: item[0])


def run_migrations(engine: Engine) -> int:
    current_version = _current_version(engine)
    latest_version = current_version

    for version, module in _load_migrations():
        if version <= current_version:
            continue
        with engine.begin() as connection:
            module.apply(connection)
        _record_version(engine, version)
        latest_version = version

    return latest_version
