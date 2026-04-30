from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_session
from app.schemas import MockExamCreate, MockExamResponse, MockExamSummaryResponse, MockExamUpdate
from app.services.mock_exam_service import (
    create_mock_exam,
    delete_mock_exam,
    get_mock_exam,
    get_mock_exam_summary,
    list_mock_exams,
    update_mock_exam,
)


router = APIRouter(prefix="/api/mock-exams")


@router.get("", response_model=list[MockExamResponse])
def read_mock_exams() -> list[MockExamResponse]:
    with get_session() as session:
        return list_mock_exams(session)


@router.get("/summary", response_model=MockExamSummaryResponse)
def read_mock_exam_summary() -> MockExamSummaryResponse:
    with get_session() as session:
        return get_mock_exam_summary(session)


@router.get("/{exam_id}", response_model=MockExamResponse)
def read_mock_exam(exam_id: int) -> MockExamResponse:
    with get_session() as session:
        try:
            return get_mock_exam(session, exam_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("", response_model=MockExamResponse)
def create_mock_exam_route(payload: MockExamCreate) -> MockExamResponse:
    with get_session() as session:
        try:
            return create_mock_exam(session, payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/{exam_id}", response_model=MockExamResponse)
def update_mock_exam_route(exam_id: int, payload: MockExamUpdate) -> MockExamResponse:
    with get_session() as session:
        try:
            return update_mock_exam(session, exam_id, payload)
        except ValueError as exc:
            message = str(exc)
            status_code = 404 if "nao encontrado" in message else 400
            raise HTTPException(status_code=status_code, detail=message) from exc


@router.delete("/{exam_id}", status_code=204)
def delete_mock_exam_route(exam_id: int) -> None:
    with get_session() as session:
        try:
            delete_mock_exam(session, exam_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
