from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from app.settings import load_env_file


DEFAULT_PROVIDER = "lm_studio"
DEFAULT_MODEL = "gemma-4-e4b"
DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1"
DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_TIMEOUT_SECONDS = 30.0
SUPPORTED_PROVIDERS = {"lm_studio", "openrouter"}


@dataclass(frozen=True)
class LLMSettings:
    provider: str
    model: str
    base_url: str
    timeout_seconds: float
    api_key: str | None = None


def _env(name: str, default: str) -> str:
    value = os.getenv(name, default).strip()
    return value or default


def _default_base_url(provider: str) -> str:
    if provider == "openrouter":
        return DEFAULT_OPENROUTER_BASE_URL
    return DEFAULT_BASE_URL


def _resolve_api_key(provider: str) -> str | None:
    if provider == "openrouter":
        api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("STUDY_HUB_LLM_API_KEY")
        return api_key.strip() if api_key else None

    api_key = os.getenv("STUDY_HUB_LLM_API_KEY")
    return api_key.strip() if api_key else None


@lru_cache(maxsize=1)
def get_llm_settings() -> LLMSettings:
    load_env_file()

    provider = _env("STUDY_HUB_LLM_PROVIDER", DEFAULT_PROVIDER).lower()
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(f"Provider LLM nao suportado: {provider}")

    base_url = _env("STUDY_HUB_LLM_BASE_URL", _default_base_url(provider)).rstrip("/")
    timeout_raw = _env("STUDY_HUB_LLM_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))

    try:
        timeout_seconds = float(timeout_raw)
    except ValueError as exc:
        raise ValueError("STUDY_HUB_LLM_TIMEOUT_SECONDS deve ser numerico.") from exc

    if timeout_seconds <= 0:
        raise ValueError("STUDY_HUB_LLM_TIMEOUT_SECONDS deve ser maior que zero.")

    return LLMSettings(
        provider=provider,
        model=_env("STUDY_HUB_LLM_MODEL", DEFAULT_MODEL),
        base_url=base_url,
        timeout_seconds=timeout_seconds,
        api_key=_resolve_api_key(provider),
    )
