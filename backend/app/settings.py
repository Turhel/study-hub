from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path


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
