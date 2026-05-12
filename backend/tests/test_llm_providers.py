from __future__ import annotations

import json

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db import create_db_engine, init_db
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


def test_manual_essay_correction_endpoint_saves_without_llm(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "manual_essay.db"
    engine = create_db_engine(f"sqlite:///{db_path.as_posix()}")
    init_db(engine)

    def _session_factory() -> Session:
        return Session(engine, expire_on_commit=False)

    monkeypatch.setattr("app.services.essay_service.get_session", _session_factory)
    with TestClient(app) as client:
        response = client.post(
            "/api/essay/manual-corrections",
            json={
                "theme": "TESTE_MANUAL_REDACAO_DELETE_ME",
                "essay_text": "Texto curto apenas para validar gravacao manual em banco temporario.",
                "external_provider": "ChatGPT",
                "c1": 160,
                "c2": 120,
                "c3": 120,
                "c4": 160,
                "c5": 120,
                "strengths": ["Tema claro"],
                "weaknesses": ["Argumentos ainda simples"],
                "improvement_plan": ["Detalhar repertorio"],
                "notes": "Teste automatizado temporario.",
            },
        )
        list_response = client.get("/api/essay/corrections?limit=20")

    engine.dispose()
    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "manual_external"
    assert payload["model"] == "ChatGPT"
    assert payload["estimated_score_range"] == {"min": 680, "max": 680}
    assert payload["competencies"]["C1"]["score"] == 160
    assert payload["strengths"] == ["Tema claro"]
    assert payload["tokens_total"] == 0
    assert list_response.status_code == 200
    history = list_response.json()
    assert history[0]["correction_id"] == payload["id"]
    assert history[0]["theme"] == "TESTE_MANUAL_REDACAO_DELETE_ME"
    assert history[0]["source"] == "manual"
    assert history[0]["provider"] == "ChatGPT"
    assert history[0]["total_score"] == 680
    assert history[0]["c1"] == 160


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


def test_essay_parser_accepts_lowercase_competency_keys() -> None:
    parsed = _parse_correction_output_defensive(
        json.dumps(
            {
                "estimated_score_range": {"min": 600, "max": 640},
                "competencies": {
                    "c1": {"score": 120, "comment": "Norma suficiente."},
                    "c2": {"score": 120, "comment": "Tema compreendido."},
                    "c3": {"score": 120, "comment": "Argumentacao simples."},
                    "c4": {"score": 120, "comment": "Coesao funcional."},
                    "c5": {"score": 120, "comment": "Proposta basica."},
                },
                "strengths": ["Clareza"],
                "weaknesses": ["Pouco repertorio"],
                "improvement_plan": ["Detalhar proposta"],
                "confidence_note": "Media.",
            }
        )
    )

    assert parsed.estimated_score_min == 600
    assert parsed.competencies["C1"].score == 120
    assert parsed.competencies["C5"].comment == "Proposta basica."


def test_essay_parser_accepts_portuguese_competencias_key() -> None:
    parsed = _parse_correction_output_defensive(
        json.dumps(
            {
                "nota_estimada": {"min": 560, "max": 600},
                "competencias": {
                    "C1": {"nota": 120, "comentario": "Poucos desvios."},
                    "C2": {"nota": 120, "comentario": "Tema atendido."},
                    "C3": {"nota": 120, "comentario": "Projeto textual previsivel."},
                    "C4": {"nota": 100, "comentario": "Coesao irregular."},
                    "C5": {"nota": 100, "comentario": "Intervencao incompleta."},
                },
                "pontos_fortes": ["Atende ao tema"],
                "pontos_fracos": ["Falta detalhamento"],
                "plano_de_melhoria": ["Treinar C5"],
                "confianca": "Media.",
            },
            ensure_ascii=False,
        )
    )

    assert parsed.estimated_score_min == 560
    assert parsed.competencies["C4"].score == 100
    assert parsed.strengths == ["Atende ao tema"]
    assert parsed.improvement_plan == ["Treinar C5"]


def test_essay_parser_accepts_competencies_as_list() -> None:
    parsed = _parse_correction_output_defensive(
        json.dumps(
            {
                "score": 600,
                "competencies": [
                    {"id": "C1", "score": 120, "comment": "Norma adequada."},
                    {"id": "C2", "score": 120, "comment": "Tema compreendido."},
                    {"id": "C3", "score": 120, "comment": "Argumentos simples."},
                    {"id": "C4", "score": 120, "comment": "Boa conexao."},
                    {"id": "C5", "score": 120, "comment": "Proposta presente."},
                ],
                "strengths": "Texto claro.",
                "weaknesses": "Pouca profundidade.",
                "improvement_plan": "Adicionar repertorio.",
                "confidence_note": "Media.",
            }
        )
    )

    assert parsed.estimated_score_min == 600
    assert parsed.estimated_score_max == 600
    assert parsed.competencies["C3"].comment == "Argumentos simples."
    assert parsed.weaknesses == ["Pouca profundidade."]


def test_essay_parser_extracts_json_with_surrounding_text() -> None:
    parsed = _parse_correction_output_defensive(
        "Segue a correcao:\n"
        + json.dumps(
            {
                "estimated_score_range": {"min": 620, "max": 660},
                "competencies": {
                    "C1": {"score": 120, "comment": "Controle formal suficiente."},
                    "C2": {"score": 120, "comment": "Recorte tematico claro."},
                    "C3": {"score": 120, "comment": "Argumentacao basica."},
                    "C4": {"score": 140, "comment": "Boa articulacao."},
                    "C5": {"score": 120, "comment": "Proposta pertinente."},
                },
                "strengths": ["Boa organizacao"],
                "weaknesses": ["Pouco desenvolvimento"],
                "improvement_plan": ["Ampliar explicacao dos argumentos"],
                "confidence_note": "Media.",
            }
        )
        + "\nFim."
    )

    assert parsed.estimated_score_min == 620
    assert parsed.competencies["C4"].score == 140
    assert parsed.confidence_note == "Media."


def test_essay_parser_recovers_corrupted_openrouter_jsonish_output() -> None:
    parsed = _parse_correction_output_defensive(
        (
            '{"estimated_score_range":{"min":560,"max":560},"competencies":{'
            '"C1":{"score":160,"comment":"Erros minimos e dominio formal adequado."},'
            '"C2":{"score":120,"comment":"Texto compreende o tema, mas desenvolve-se de forma superficial."},'
            '"C3\\":{\\"\n\n{"score\\":80,"comment\\":\\"Argumentacao fraca, generica e sem exemplos concretos.\\"},'
            '"C4":{"score":120,"comment":"Coesao funcional, com articulacao simples."},'
            '"C5":{"score":80,"comment":"Proposta presente, mas pouco detalhada."}'
        )
    )

    assert parsed.estimated_score_min == 560
    assert parsed.estimated_score_max == 560
    assert parsed.competencies["C1"].score == 160
    assert parsed.competencies["C3"].score == 80
    assert "generica" in parsed.competencies["C3"].comment
    assert "parcialmente corrompido" in parsed.confidence_note


def test_essay_parser_accepts_rubric_specific_comment_fields() -> None:
    parsed = _parse_correction_output_defensive(
        json.dumps(
            {
                "estimated_score_range": {"min": 560, "max": 560},
                "competencies": {
                    "C1": {"score": 160, "motivo_da_nota": "Poucos desvios formais."},
                    "C2": {"score": 120, "ponto_forte_principal": "Compreende o tema."},
                    "C3": {"score": 80, "falha_principal": "Argumentacao generica."},
                    "C4": {"score": 120, "por_que_nao_recebeu_a_nota_acima": "Coesao simples."},
                    "C5": {"score": 80, "justificativa": "Proposta pouco detalhada."},
                },
                "strengths": ["Boa clareza"],
                "weaknesses": ["Pouco aprofundamento"],
                "improvement_plan": ["Detalhar argumentos"],
                "confidence_note": "Media.",
            },
            ensure_ascii=False,
        )
    )

    assert parsed.competencies["C1"].comment == "Poucos desvios formais."
    assert parsed.competencies["C3"].comment == "Argumentacao generica."
