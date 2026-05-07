from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.llm.config import DEFAULT_OPENROUTER_BASE_URL, get_llm_settings
from app.main import app
from app.services.essay_service import _parse_correction_output_defensive


def _clear_llm_caches() -> None:
    get_llm_settings.cache_clear()


def test_openrouter_settings_reflect_env(monkeypatch) -> None:
    monkeypatch.setenv("STUDY_HUB_LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("STUDY_HUB_LLM_MODEL", "openai/gpt-4o-mini")
    monkeypatch.delenv("STUDY_HUB_LLM_BASE_URL", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    monkeypatch.delenv("STUDY_HUB_LLM_API_KEY", raising=False)
    _clear_llm_caches()

    settings = get_llm_settings()

    assert settings.provider == "openrouter"
    assert settings.model == "openai/gpt-4o-mini"
    assert settings.base_url == DEFAULT_OPENROUTER_BASE_URL
    assert settings.api_key == "test-openrouter-key"


def test_lm_studio_settings_still_work(monkeypatch) -> None:
    monkeypatch.setenv("STUDY_HUB_LLM_PROVIDER", "lm_studio")
    monkeypatch.setenv("STUDY_HUB_LLM_MODEL", "gemma-4-e4b")
    monkeypatch.setenv("STUDY_HUB_LLM_BASE_URL", "http://127.0.0.1:1234/v1")
    monkeypatch.setenv("STUDY_HUB_LLM_API_KEY", "lm-studio")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    _clear_llm_caches()

    settings = get_llm_settings()

    assert settings.provider == "lm_studio"
    assert settings.model == "gemma-4-e4b"
    assert settings.base_url == "http://127.0.0.1:1234/v1"
    assert settings.api_key == "lm-studio"


def test_system_capabilities_reflect_openrouter(monkeypatch) -> None:
    monkeypatch.setenv("STUDY_HUB_MACHINE_PROFILE", "render")
    monkeypatch.setenv("STUDY_HUB_LLM_ENABLED", "true")
    monkeypatch.setenv("STUDY_HUB_ESSAY_CORRECTION_ENABLED", "true")
    monkeypatch.setenv("STUDY_HUB_ESSAY_STUDY_ENABLED", "true")
    monkeypatch.setenv("STUDY_HUB_LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("STUDY_HUB_LLM_MODEL", "openai/gpt-4o-mini")
    _clear_llm_caches()

    with TestClient(app) as client:
        response = client.get("/api/system/capabilities")

    assert response.status_code == 200
    payload = response.json()
    assert payload["machine_profile"] == "render"
    assert payload["llm"]["enabled"] is True
    assert payload["llm"]["provider"] == "openrouter"
    assert payload["llm"]["model"] == "openai/gpt-4o-mini"
    assert payload["features"]["essay_correction_enabled"] is True
    assert payload["features"]["essay_study_enabled"] is True


def test_openrouter_without_api_key_returns_clear_error(monkeypatch) -> None:
    monkeypatch.setenv("STUDY_HUB_LLM_ENABLED", "true")
    monkeypatch.setenv("STUDY_HUB_ESSAY_CORRECTION_ENABLED", "true")
    monkeypatch.setenv("STUDY_HUB_LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("STUDY_HUB_LLM_MODEL", "openai/gpt-4o-mini")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("STUDY_HUB_LLM_API_KEY", raising=False)
    _clear_llm_caches()

    with TestClient(app) as client:
        response = client.post(
            "/api/essay/correct",
            json={
                "theme": "TESTE_OPENROUTER_DELETE_ME",
                "essay_text": "Texto curto de teste para validar provider sem chave.",
                "mode": "detailed",
            },
        )

    assert response.status_code == 503
    payload = response.json()
    assert payload["detail"]["code"] == "lm_unavailable"
    assert "OPENROUTER_API_KEY" in payload["detail"]["message"]


def test_essay_parser_contract_still_accepts_structured_json() -> None:
    parsed = _parse_correction_output_defensive(
        json.dumps(
            {
                "estimated_score_range": {"min": 720, "max": 760},
                "competencies": {
                    "C1": {"score": 160, "comment": "Domina bem a norma culta."},
                    "C2": {"score": 140, "comment": "Compreende o tema de forma suficiente."},
                    "C3": {"score": 160, "comment": "Organiza o argumento com boa progressao."},
                    "C4": {"score": 140, "comment": "Mantem coesao com pequenas oscilacoes."},
                    "C5": {"score": 140, "comment": "Apresenta proposta de intervencao valida."},
                },
                "strengths": ["Argumentacao consistente"],
                "weaknesses": ["Pode aprofundar repertorio"],
                "improvement_plan": ["Treinar repertorio sociocultural"],
                "confidence_note": "Estimativa assistida.",
            }
        )
    )

    assert parsed.estimated_score_min == 720
    assert parsed.estimated_score_max == 760
    assert parsed.competencies["C1"].score == 160
    assert parsed.strengths == ["Argumentacao consistente"]
    assert parsed.weaknesses == ["Pode aprofundar repertorio"]
    assert parsed.improvement_plan == ["Treinar repertorio sociocultural"]
    assert parsed.confidence_note == "Estimativa assistida."
