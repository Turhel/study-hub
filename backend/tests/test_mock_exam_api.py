from __future__ import annotations

import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db import create_db_engine, init_db
from app.main import app
from app.models import MockExam
from app.services.mock_exam_service import get_mock_exam_summary


@dataclass
class MockExamContext:
    engine: object
    temp_dir: Path


def _build_context() -> MockExamContext:
    temp_dir = Path(tempfile.mkdtemp(prefix="mock-exams-tests-"))
    db_path = temp_dir / "mock_exams.db"
    engine = create_db_engine(f"sqlite:///{db_path.as_posix()}")
    init_db(engine)
    return MockExamContext(engine=engine, temp_dir=temp_dir)


def _cleanup_context(context: MockExamContext) -> None:
    context.engine.dispose()
    shutil.rmtree(context.temp_dir, ignore_errors=True)


def _override_session_factory(context: MockExamContext):
    def _factory():
        return Session(context.engine, expire_on_commit=False)

    return _factory


def test_mock_exam_crud_and_summary(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)

        create_response = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-04-28",
                "title": "Simulado Natureza 1",
                "area": "Natureza",
                "total_questions": 45,
                "correct_count": 31,
                "tri_score": None,
                "duration_minutes": 180,
                "notes": "Primeiro teste.",
            },
        )
        assert create_response.status_code == 200
        created = create_response.json()
        assert created["accuracy"] == 31 / 45
        exam_id = created["id"]

        second_response = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-04-29",
                "title": "Simulado Natureza 2",
                "area": "Natureza",
                "total_questions": 45,
                "correct_count": 34,
                "tri_score": 672.5,
                "duration_minutes": None,
                "notes": None,
            },
        )
        assert second_response.status_code == 200

        third_response = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-04-30",
                "title": "Simulado Matemática",
                "area": "Matemática",
                "total_questions": 45,
                "correct_count": 29,
                "tri_score": 701.0,
                "duration_minutes": 190,
                "notes": "Tempo alto.",
            },
        )
        assert third_response.status_code == 200

        list_response = client.get("/api/mock-exams")
        assert list_response.status_code == 200
        listed = list_response.json()
        assert len(listed) == 3
        assert listed[0]["title"] == "Simulado Matemática"

        get_response = client.get(f"/api/mock-exams/{exam_id}")
        assert get_response.status_code == 200
        assert get_response.json()["title"] == "Simulado Natureza 1"

        update_response = client.put(
            f"/api/mock-exams/{exam_id}",
            json={
                "correct_count": 33,
                "tri_score": 640.0,
                "notes": "Revisado.",
            },
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["correct_count"] == 33
        assert updated["tri_score"] == 640.0

        summary_response = client.get("/api/mock-exams/summary")
        assert summary_response.status_code == 200
        summary = summary_response.json()
        assert summary["total_exams"] == 3
        assert summary["latest_exam_date"] == "2026-04-30"
        assert summary["best_tri_score"] == 701.0
        assert summary["last_three_average_tri"] == (640.0 + 672.5 + 701.0) / 3
        assert summary["last_three_average_accuracy"] is not None
        assert len(summary["by_area"]) == 2
        assert len(summary["recent"]) == 3

        delete_response = client.delete(f"/api/mock-exams/{exam_id}")
        assert delete_response.status_code == 204

        with Session(context.engine, expire_on_commit=False) as session:
            rows = session.exec(select(MockExam)).all()
            assert len(rows) == 2
            service_summary = get_mock_exam_summary(session)
            assert service_summary.total_exams == 2
            assert service_summary.last_three_average_tri is not None
    finally:
        _cleanup_context(context)


def test_mock_exam_validation_rejects_invalid_correct_count(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)
        response = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-04-30",
                "title": "Invalido",
                "area": "Geral",
                "total_questions": 30,
                "correct_count": 31,
                "tri_score": None,
                "duration_minutes": None,
                "notes": None,
            },
        )
        assert response.status_code == 400
        assert "Acertos nao pode ser maior" in response.json()["detail"]
    finally:
        _cleanup_context(context)


def test_mock_exam_summary_handles_null_tri(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)
        client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-04-30",
                "title": "Sem TRI",
                "area": "Humanas",
                "total_questions": 90,
                "correct_count": 54,
                "tri_score": None,
                "duration_minutes": 300,
                "notes": None,
            },
        )
        response = client.get("/api/mock-exams/summary")
        assert response.status_code == 200
        payload = response.json()
        assert payload["total_exams"] == 1
        assert payload["last_three_average_tri"] is None
        assert payload["best_tri_score"] is None
        assert payload["last_three_average_accuracy"] == 0.6
    finally:
        _cleanup_context(context)
