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
        assert summary["best_tri_score"] is not None
        assert summary["best_tri_score"] > 700
        assert summary["last_three_average_tri"] is not None
        assert summary["last_three_average_tri"] > 650
        assert summary["last_three_average_accuracy"] is not None
        assert len(summary["by_area"]) == 2
        assert len(summary["recent"]) == 3
        assert updated["official_tri_score"] == 640.0
        assert updated["estimated_tri_score"] is not None
        assert updated["estimated_tri_score"] != updated["official_tri_score"]

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


def test_delete_mock_exam_with_questions(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)

        create_response = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-05-01",
                "title": "Excluir com questoes",
                "area": "Geral",
                "mode": "external",
                "total_questions": 4,
                "correct_count": 0,
                "tri_score": None,
                "duration_minutes": 60,
                "notes": "Teste de exclusao.",
            },
        )
        assert create_response.status_code == 200
        exam_id = create_response.json()["id"]

        placeholders_response = client.post(
            f"/api/mock-exams/{exam_id}/questions/generate-placeholders",
            json={
                "total_questions": 4,
                "areas": [{"area": "Geral", "start": 1, "end": 4}],
            },
        )
        assert placeholders_response.status_code == 200

        delete_response = client.delete(f"/api/mock-exams/{exam_id}")
        assert delete_response.status_code == 204

        get_response = client.get(f"/api/mock-exams/{exam_id}")
        assert get_response.status_code == 404
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
        assert payload["last_three_average_tri"] is not None
        assert payload["best_tri_score"] is not None
        assert payload["last_three_average_accuracy"] == 0.6
    finally:
        _cleanup_context(context)



def test_mock_exam_execution_flow_and_results(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)

        create_response = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-05-01",
                "title": "Simulado ENEM Dia 2",
                "area": "Geral",
                "mode": "external",
                "total_questions": 6,
                "correct_count": 0,
                "tri_score": None,
                "duration_minutes": 300,
                "notes": "Execucao de teste.",
            },
        )
        assert create_response.status_code == 200
        exam_id = create_response.json()["id"]

        placeholders_response = client.post(
            f"/api/mock-exams/{exam_id}/questions/generate-placeholders",
            json={
                "total_questions": 6,
                "areas": [
                    {"area": "Matematica", "start": 1, "end": 3},
                    {"area": "Natureza", "start": 4, "end": 6},
                ],
            },
        )
        assert placeholders_response.status_code == 200
        assert placeholders_response.json()["created_questions"] == 6

        start_response = client.post(f"/api/mock-exams/{exam_id}/start")
        assert start_response.status_code == 200
        started = start_response.json()
        assert started["exam"]["status"] == "in_progress"
        assert started["questions_count"] == 6

        questions_response = client.get(f"/api/mock-exams/{exam_id}/questions")
        assert questions_response.status_code == 200
        questions = questions_response.json()
        assert len(questions) == 6

        q1 = questions[0]["id"]
        q2 = questions[1]["id"]
        q4 = questions[3]["id"]

        update_q1 = client.put(
            f"/api/mock-exams/{exam_id}/questions/{q1}",
            json={
                "user_answer": "A",
                "correct_answer": "A",
                "difficulty_percent": 18,
                "time_seconds": 92,
                "notes": "Acertou.",
            },
        )
        assert update_q1.status_code == 200
        assert update_q1.json()["is_correct"] is True

        update_q2 = client.put(
            f"/api/mock-exams/{exam_id}/questions/{q2}",
            json={
                "user_answer": "B",
                "correct_answer": "D",
                "difficulty_percent": 72,
                "time_seconds": 115,
            },
        )
        assert update_q2.status_code == 200
        assert update_q2.json()["is_correct"] is False

        skip_q4 = client.put(
            f"/api/mock-exams/{exam_id}/questions/{q4}",
            json={
                "skipped": True,
                "difficulty_percent": 41,
                "time_seconds": 64,
            },
        )
        assert skip_q4.status_code == 200
        assert skip_q4.json()["skipped"] is True
        assert skip_q4.json()["is_correct"] is None

        invalid_difficulty = client.put(
            f"/api/mock-exams/{exam_id}/questions/{q4}",
            json={"difficulty_percent": 120},
        )
        assert invalid_difficulty.status_code == 422

        finish_response = client.post(f"/api/mock-exams/{exam_id}/finish")
        assert finish_response.status_code == 200
        finished = finish_response.json()
        assert finished["exam"]["status"] == "finished"
        assert finished["total_questions"] == 6
        assert finished["answered_count"] == 2
        assert finished["skipped_count"] == 1
        assert finished["correct_count"] == 1
        assert len(finished["by_area"]) == 2

        results_response = client.get(f"/api/mock-exams/{exam_id}/results")
        assert results_response.status_code == 200
        results = results_response.json()
        assert results["exam"]["status"] == "finished"
        assert len(results["questions"]) == 6
        assert len(results["by_area"]) == 2

        area_scores = [item["estimated_tri_score"] for item in results["by_area"] if item["estimated_tri_score"] is not None]
        assert len(area_scores) == 2
        assert results["overall_area_average_score"] == round(sum(area_scores) / len(area_scores), 1)
        assert results["estimated_tri_score"] == results["exam"]["estimated_tri_score"]
    finally:
        _cleanup_context(context)


def test_mock_exam_delete_also_removes_placeholder_questions(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)

        create_response = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-05-01",
                "title": "Delete with questions",
                "area": "Geral",
                "mode": "external",
                "total_questions": 4,
                "correct_count": 0,
                "tri_score": None,
                "duration_minutes": 60,
                "notes": None,
            },
        )
        assert create_response.status_code == 200
        exam_id = create_response.json()["id"]

        placeholders_response = client.post(
            f"/api/mock-exams/{exam_id}/questions/generate-placeholders",
            json={
                "total_questions": 4,
                "areas": [
                    {"area": "Matematica", "start": 1, "end": 2},
                    {"area": "Natureza", "start": 3, "end": 4},
                ],
            },
        )
        assert placeholders_response.status_code == 200

        delete_response = client.delete(f"/api/mock-exams/{exam_id}")
        assert delete_response.status_code == 204

        questions_response = client.get(f"/api/mock-exams/{exam_id}/questions")
        assert questions_response.status_code == 404
    finally:
        _cleanup_context(context)


def test_mock_exam_estimate_stays_low_for_two_hits_in_ninety(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)

        exam = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-05-01",
                "title": "Simulado baixo desempenho",
                "area": "Geral",
                "mode": "external",
                "total_questions": 90,
                "correct_count": 0,
                "tri_score": None,
                "duration_minutes": 300,
                "notes": None,
            },
        ).json()

        client.post(
            f"/api/mock-exams/{exam['id']}/questions/generate-placeholders",
            json={
                "total_questions": 90,
                "areas": [
                    {"area": "Matematica", "start": 1, "end": 45},
                    {"area": "Natureza", "start": 46, "end": 90},
                ],
            },
        )
        client.post(f"/api/mock-exams/{exam['id']}/start")
        questions = client.get(f"/api/mock-exams/{exam['id']}/questions").json()

        client.put(
            f"/api/mock-exams/{exam['id']}/questions/{questions[0]['id']}",
            json={"user_answer": "A", "correct_answer": "A", "difficulty_percent": 8, "time_seconds": 90},
        )
        client.put(
            f"/api/mock-exams/{exam['id']}/questions/{questions[45]['id']}",
            json={"user_answer": "B", "correct_answer": "B", "difficulty_percent": 12, "time_seconds": 95},
        )

        client.post(f"/api/mock-exams/{exam['id']}/finish")
        results = client.get(f"/api/mock-exams/{exam['id']}/results").json()

        assert results["correct_count"] == 2
        assert results["overall_area_average_score"] is not None
        assert results["overall_area_average_score"] <= 400
        assert results["estimated_tri_score"] <= 400
    finally:
        _cleanup_context(context)


def test_mock_exam_estimate_matches_low_math_reference_for_two_hits(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)

        exam = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-05-01",
                "title": "Matematica 2 acertos",
                "area": "Matematica",
                "mode": "external",
                "total_questions": 45,
                "correct_count": 0,
                "tri_score": None,
                "duration_minutes": 180,
                "notes": None,
            },
        ).json()

        client.post(
            f"/api/mock-exams/{exam['id']}/questions/generate-placeholders",
            json={"total_questions": 45, "areas": [{"area": "Matematica", "start": 1, "end": 45}]},
        )
        client.post(f"/api/mock-exams/{exam['id']}/start")
        questions = client.get(f"/api/mock-exams/{exam['id']}/questions").json()

        client.put(
            f"/api/mock-exams/{exam['id']}/questions/{questions[0]['id']}",
            json={"user_answer": "A", "correct_answer": "A", "difficulty_percent": 18, "time_seconds": 85},
        )
        client.put(
            f"/api/mock-exams/{exam['id']}/questions/{questions[1]['id']}",
            json={"user_answer": "B", "correct_answer": "B", "difficulty_percent": 22, "time_seconds": 88},
        )

        client.post(f"/api/mock-exams/{exam['id']}/finish")
        results = client.get(f"/api/mock-exams/{exam['id']}/results").json()
        math_score = results["by_area"][0]["estimated_tri_score"]

        assert math_score is not None
        assert math_score < 450
        assert 360 <= math_score <= 400
    finally:
        _cleanup_context(context)


def test_mock_exam_estimate_puts_twelve_math_hits_near_530(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)

        exam = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-05-01",
                "title": "Matematica 12 acertos",
                "area": "Matematica",
                "mode": "external",
                "total_questions": 45,
                "correct_count": 0,
                "tri_score": None,
                "duration_minutes": 180,
                "notes": None,
            },
        ).json()

        client.post(
            f"/api/mock-exams/{exam['id']}/questions/generate-placeholders",
            json={"total_questions": 45, "areas": [{"area": "Matematica", "start": 1, "end": 45}]},
        )
        client.post(f"/api/mock-exams/{exam['id']}/start")
        questions = client.get(f"/api/mock-exams/{exam['id']}/questions").json()

        for question in questions[:12]:
            client.put(
                f"/api/mock-exams/{exam['id']}/questions/{question['id']}",
                json={"user_answer": "A", "correct_answer": "A", "difficulty_percent": 40, "time_seconds": 80},
            )

        client.post(f"/api/mock-exams/{exam['id']}/finish")
        results = client.get(f"/api/mock-exams/{exam['id']}/results").json()
        math_score = results["by_area"][0]["estimated_tri_score"]

        assert math_score is not None
        assert 520 <= math_score <= 545
    finally:
        _cleanup_context(context)


def test_mock_exam_difficulty_adjustment_stays_small(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)

        exam = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-05-01",
                "title": "Ajuste de dificuldade",
                "area": "Matematica",
                "mode": "external",
                "total_questions": 45,
                "correct_count": 0,
                "tri_score": None,
                "duration_minutes": 180,
                "notes": None,
            },
        ).json()

        client.post(
            f"/api/mock-exams/{exam['id']}/questions/generate-placeholders",
            json={"total_questions": 45, "areas": [{"area": "Matematica", "start": 1, "end": 45}]},
        )
        client.post(f"/api/mock-exams/{exam['id']}/start")
        questions = client.get(f"/api/mock-exams/{exam['id']}/questions").json()

        for question in questions[:12]:
            client.put(
                f"/api/mock-exams/{exam['id']}/questions/{question['id']}",
                json={"user_answer": "A", "correct_answer": "A", "difficulty_percent": 10, "time_seconds": 80},
            )
        hard_results = client.post(f"/api/mock-exams/{exam['id']}/finish").json()
        hard_score = hard_results["by_area"][0]["estimated_tri_score"]

        exam_easy = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-05-02",
                "title": "Ajuste facil",
                "area": "Matematica",
                "mode": "external",
                "total_questions": 45,
                "correct_count": 0,
                "tri_score": None,
                "duration_minutes": 180,
                "notes": None,
            },
        ).json()
        client.post(
            f"/api/mock-exams/{exam_easy['id']}/questions/generate-placeholders",
            json={"total_questions": 45, "areas": [{"area": "Matematica", "start": 1, "end": 45}]},
        )
        client.post(f"/api/mock-exams/{exam_easy['id']}/start")
        questions_easy = client.get(f"/api/mock-exams/{exam_easy['id']}/questions").json()
        for question in questions_easy[:12]:
            client.put(
                f"/api/mock-exams/{exam_easy['id']}/questions/{question['id']}",
                json={"user_answer": "A", "correct_answer": "A", "difficulty_percent": 90, "time_seconds": 80},
            )
        easy_results = client.post(f"/api/mock-exams/{exam_easy['id']}/finish").json()
        easy_score = easy_results["by_area"][0]["estimated_tri_score"]

        assert hard_score is not None and easy_score is not None
        assert abs(hard_score - easy_score) <= 35
        assert hard_score > easy_score
    finally:
        _cleanup_context(context)


def test_manual_mock_exam_estimate_for_math_two_hits(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)

        response = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-05-01",
                "title": "Manual Matematica 2/45",
                "area": "Matematica",
                "total_questions": 45,
                "correct_count": 2,
                "tri_score": None,
                "duration_minutes": 180,
                "notes": None,
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["official_tri_score"] is None
        assert 360 <= payload["estimated_tri_score"] <= 400
    finally:
        _cleanup_context(context)


def test_manual_mock_exam_estimate_for_math_twelve_hits(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)

        response = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-05-01",
                "title": "Manual Matematica 12/45",
                "area": "Matematica",
                "total_questions": 45,
                "correct_count": 12,
                "tri_score": None,
                "duration_minutes": 180,
                "notes": None,
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert 525 <= payload["estimated_tri_score"] <= 540
    finally:
        _cleanup_context(context)


def test_manual_mock_exam_estimate_for_natureza_two_hits(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)

        response = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-05-01",
                "title": "Manual Natureza 2/45",
                "area": "Natureza",
                "total_questions": 45,
                "correct_count": 2,
                "tri_score": None,
                "duration_minutes": 180,
                "notes": None,
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert 330 <= payload["estimated_tri_score"] <= 360
    finally:
        _cleanup_context(context)


def test_manual_mock_exam_estimate_for_general_two_hits_in_ninety(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)

        response = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-05-01",
                "title": "Manual Geral 2/90",
                "area": "Geral",
                "total_questions": 90,
                "correct_count": 2,
                "tri_score": None,
                "duration_minutes": 300,
                "notes": None,
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["estimated_tri_score"] is not None
        assert payload["estimated_tri_score"] <= 400
    finally:
        _cleanup_context(context)


def test_mock_exam_list_recomputes_stale_estimate_for_old_record(monkeypatch) -> None:
    context = _build_context()
    try:
        monkeypatch.setattr("app.routes.mock_exams.get_session", _override_session_factory(context))
        client = TestClient(app)

        create_response = client.post(
            "/api/mock-exams",
            json={
                "exam_date": "2026-05-01",
                "title": "Antigo 2/90",
                "area": "Geral",
                "total_questions": 90,
                "correct_count": 2,
                "tri_score": None,
                "duration_minutes": 300,
                "notes": None,
            },
        )
        assert create_response.status_code == 200
        exam_id = create_response.json()["id"]

        with Session(context.engine, expire_on_commit=False) as session:
            exam = session.get(MockExam, exam_id)
            assert exam is not None
            exam.estimated_tri_score = 549.0
            session.add(exam)
            session.commit()

        list_response = client.get("/api/mock-exams")
        assert list_response.status_code == 200
        listed_exam = next(item for item in list_response.json() if item["id"] == exam_id)
        assert listed_exam["estimated_tri_score"] <= 400
        assert listed_exam["estimated_tri_score"] != 549.0

        summary_response = client.get("/api/mock-exams/summary")
        assert summary_response.status_code == 200
        recent_exam = next(item for item in summary_response.json()["recent"] if item["id"] == exam_id)
        assert recent_exam["estimated_tri_score"] == listed_exam["estimated_tri_score"]
    finally:
        _cleanup_context(context)
