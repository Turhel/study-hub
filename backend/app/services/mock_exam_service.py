from __future__ import annotations

from datetime import date, datetime
from statistics import mean
from typing import Any

from sqlmodel import Session, select

from app.models import MockExam
from app.schemas import (
    MockExamAreaSummary,
    MockExamCreate,
    MockExamResponse,
    MockExamSummaryResponse,
    MockExamUpdate,
)


def _parse_exam_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Informe uma data valida no formato YYYY-MM-DD.") from exc


def _validate_counts(total_questions: int, correct_count: int) -> None:
    if total_questions <= 0:
        raise ValueError("Total de questoes deve ser maior que zero.")
    if correct_count < 0:
        raise ValueError("Acertos nao pode ser negativo.")
    if correct_count > total_questions:
        raise ValueError("Acertos nao pode ser maior que o total de questoes.")


def _accuracy(exam: MockExam) -> float:
    if exam.total_questoes <= 0:
        return 0.0
    return exam.total_acertos / exam.total_questoes


def _to_response(exam: MockExam) -> MockExamResponse:
    return MockExamResponse(
        id=exam.id or 0,
        exam_date=exam.data.isoformat(),
        title=exam.tipo,
        area=exam.area,  # type: ignore[arg-type]
        total_questions=exam.total_questoes,
        correct_count=exam.total_acertos,
        accuracy=_accuracy(exam),
        tri_score=exam.tri_score,
        duration_minutes=exam.tempo_total_min,
        notes=exam.observacoes,
        created_at=exam.created_at.isoformat(),
        updated_at=exam.updated_at.isoformat(),
    )


def list_mock_exams(session: Session) -> list[MockExamResponse]:
    rows = session.exec(select(MockExam).order_by(MockExam.data.desc(), MockExam.id.desc())).all()
    return [_to_response(row) for row in rows]


def get_mock_exam(session: Session, exam_id: int) -> MockExamResponse:
    exam = session.get(MockExam, exam_id)
    if exam is None:
        raise ValueError("Simulado nao encontrado.")
    return _to_response(exam)


def create_mock_exam(session: Session, payload: MockExamCreate) -> MockExamResponse:
    exam_date = _parse_exam_date(payload.exam_date)
    _validate_counts(payload.total_questions, payload.correct_count)

    now = datetime.utcnow()
    exam = MockExam(
        data=exam_date,
        tipo=payload.title.strip(),
        area=payload.area,
        total_questoes=payload.total_questions,
        total_acertos=payload.correct_count,
        tri_score=payload.tri_score,
        tempo_total_min=payload.duration_minutes,
        observacoes=payload.notes.strip() if payload.notes else None,
        created_at=now,
        updated_at=now,
    )
    session.add(exam)
    session.commit()
    session.refresh(exam)
    return _to_response(exam)


def update_mock_exam(session: Session, exam_id: int, payload: MockExamUpdate) -> MockExamResponse:
    exam = session.get(MockExam, exam_id)
    if exam is None:
        raise ValueError("Simulado nao encontrado.")

    updates: dict[str, Any] = payload.model_dump(exclude_unset=True)
    next_total = updates.get("total_questions", exam.total_questoes)
    next_correct = updates.get("correct_count", exam.total_acertos)
    _validate_counts(next_total, next_correct)

    if "exam_date" in updates and payload.exam_date is not None:
        exam.data = _parse_exam_date(payload.exam_date)
    if "title" in updates and payload.title is not None:
        exam.tipo = payload.title.strip()
    if "area" in updates and payload.area is not None:
        exam.area = payload.area
    if "total_questions" in updates and payload.total_questions is not None:
        exam.total_questoes = payload.total_questions
    if "correct_count" in updates and payload.correct_count is not None:
        exam.total_acertos = payload.correct_count
    if "tri_score" in updates:
        exam.tri_score = payload.tri_score
    if "duration_minutes" in updates:
        exam.tempo_total_min = payload.duration_minutes
    if "notes" in updates:
        exam.observacoes = payload.notes.strip() if payload.notes else None

    exam.updated_at = datetime.utcnow()
    session.add(exam)
    session.commit()
    session.refresh(exam)
    return _to_response(exam)


def delete_mock_exam(session: Session, exam_id: int) -> None:
    exam = session.get(MockExam, exam_id)
    if exam is None:
        raise ValueError("Simulado nao encontrado.")
    session.delete(exam)
    session.commit()


def get_mock_exam_summary(session: Session) -> MockExamSummaryResponse:
    rows = session.exec(select(MockExam).order_by(MockExam.data.desc(), MockExam.id.desc())).all()

    tri_recent = [row.tri_score for row in rows if row.tri_score is not None][:3]
    accuracy_recent = [_accuracy(row) for row in rows if row.total_questoes > 0][:3]
    best_tri_values = [row.tri_score for row in rows if row.tri_score is not None]

    by_area_map: dict[str, list[MockExam]] = {}
    for row in rows:
        by_area_map.setdefault(row.area, []).append(row)

    by_area = [
        MockExamAreaSummary(
            area=area,  # type: ignore[arg-type]
            total_exams=len(area_rows),
            latest_tri_score=next((item.tri_score for item in area_rows if item.tri_score is not None), None),
            best_tri_score=max((item.tri_score for item in area_rows if item.tri_score is not None), default=None),
            average_accuracy=mean(_accuracy(item) for item in area_rows) if area_rows else None,
        )
        for area, area_rows in sorted(by_area_map.items(), key=lambda item: item[0])
    ]

    return MockExamSummaryResponse(
        total_exams=len(rows),
        latest_exam_date=rows[0].data.isoformat() if rows else None,
        last_three_average_tri=mean(tri_recent) if tri_recent else None,
        last_three_average_accuracy=mean(accuracy_recent) if accuracy_recent else None,
        best_tri_score=max(best_tri_values) if best_tri_values else None,
        by_area=by_area,
        recent=[_to_response(row) for row in rows[:5]],
    )
