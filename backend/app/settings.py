from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse


@lru_cache(maxsize=1)
def get_backend_root() -> Path:
    return Path(__file__).resolve().parents[1]


@lru_cache(maxsize=1)
def load_env_file() -> None:
    env_path = get_backend_root() / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def get_env_str(name: str, default: str) -> str:
    load_env_file()
    value = os.getenv(name, default).strip()
    return value or default


def get_env_float(name: str, default: float, minimum: float | None = None) -> float:
    raw_value = get_env_str(name, str(default))
    try:
        value = float(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} deve ser numerico.") from exc

    if minimum is not None and value < minimum:
        raise ValueError(f"{name} deve ser maior ou igual a {minimum}.")

    return value


def get_env_int(name: str, default: int, minimum: int | None = None) -> int:
    raw_value = get_env_str(name, str(default))
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} deve ser inteiro.") from exc

    if minimum is not None and value < minimum:
        raise ValueError(f"{name} deve ser maior ou igual a {minimum}.")

    return value


def get_env_bool(name: str, default: bool) -> bool:
    load_env_file()
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    normalized = raw_value.strip().casefold()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} deve ser booleano.")


def get_env_csv(name: str, default: list[str]) -> list[str]:
    load_env_file()
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    values = [item.strip() for item in raw_value.split(",")]
    return [item for item in values if item]


@lru_cache(maxsize=1)
def get_default_sqlite_db_path() -> Path:
    backend_root = get_backend_root()
    data_dir = backend_root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return (data_dir / "study_hub.db").resolve()


def get_database_url() -> str:
    configured = get_env_str("DATABASE_URL", "")
    if configured:
        return configured
    sqlite_path = get_default_sqlite_db_path()
    return f"sqlite:///{sqlite_path.as_posix()}"


def is_sqlite_database_url(database_url: str) -> bool:
    return database_url.strip().casefold().startswith("sqlite")


def get_db_echo() -> bool:
    return get_env_bool("STUDY_HUB_DB_ECHO", False)


def get_database_backend_label(database_url: str) -> str:
    if is_sqlite_database_url(database_url):
        return "sqlite"
    parsed = urlparse(database_url)
    scheme = (parsed.scheme or "").casefold()
    if scheme.startswith("postgresql") or scheme.startswith("postgres"):
        return "postgres"
    return scheme or "unknown"


def get_auto_sync_structural_on_startup() -> bool:
    database_url = get_database_url()
    default_value = get_database_backend_label(database_url) == "postgres"
    return get_env_bool("STUDY_HUB_AUTO_SYNC_STRUCTURAL_ON_STARTUP", default_value)


def get_machine_profile() -> str:
    profile = get_env_str("STUDY_HUB_MACHINE_PROFILE", "local").casefold()
    return profile or "local"


def get_llm_enabled() -> bool:
    profile = get_machine_profile()
    default_value = profile != "notebook"
    return get_env_bool("STUDY_HUB_LLM_ENABLED", default_value)


def get_essay_correction_enabled() -> bool:
    return get_env_bool("STUDY_HUB_ESSAY_CORRECTION_ENABLED", get_llm_enabled())


def get_essay_study_enabled() -> bool:
    return get_env_bool("STUDY_HUB_ESSAY_STUDY_ENABLED", get_llm_enabled())


def get_llm_provider_name() -> str:
    from app.llm.config import DEFAULT_PROVIDER

    return get_env_str("STUDY_HUB_LLM_PROVIDER", DEFAULT_PROVIDER).lower()


def get_llm_model_name() -> str:
    from app.llm.config import DEFAULT_MODEL

    return get_env_str("STUDY_HUB_LLM_MODEL", DEFAULT_MODEL)


def get_cors_origins() -> list[str]:
    return get_env_csv(
        "STUDY_HUB_CORS_ORIGINS",
        ["http://localhost:5173", "http://127.0.0.1:5173"],
    )
