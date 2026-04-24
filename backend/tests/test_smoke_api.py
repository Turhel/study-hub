from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_today_shape() -> None:
    response = client.get("/api/today")
    assert response.status_code == 200
    payload = response.json()
    assert "metrics" in payload
    assert "priority" in payload
    assert "due_reviews" in payload
    assert "risk_blocks" in payload
    assert "forgotten_subjects" in payload
    assert "starting_points" in payload


def test_study_plan_today_shape() -> None:
    response = client.get("/api/study-plan/today")
    assert response.status_code == 200
    payload = response.json()
    assert "summary" in payload
    assert "items" in payload


def test_question_attempts_bulk_invalid_ids_returns_400() -> None:
    response = client.post(
        "/api/question-attempts/bulk",
        json={
            "date": "2026-01-01",
            "discipline": "Matematica",
            "block_id": 999999,
            "subject_id": 999999,
            "source": "smoke-test",
            "quantity": 5,
            "correct_count": 3,
            "difficulty_bank": "media",
            "difficulty_personal": "media",
            "elapsed_seconds": 120,
            "confidence": "media",
            "error_type": "conceito",
            "notes": "payload invalido para testar erro 400",
        },
    )
    assert response.status_code == 400
    payload = response.json()
    assert payload["detail"] in {"Bloco nao encontrado.", "Assunto nao encontrado."}
