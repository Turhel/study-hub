from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_session
from app.schemas import (
    MockExamCreate,
    MockExamFinishResponse,
    MockExamPlaceholderRequest,
    MockExamPlaceholderResponse,
    MockExamQuestionBulkCreate,
    MockExamQuestionResponse,
    MockExamQuestionUpdate,
    MockExamResponse,
    MockExamResultsResponse,
    MockExamStartResponse,
    MockExamSummaryResponse,
    MockExamUpdate,
)
from app.services.mock_exam_service import (
    create_mock_exam,
    create_mock_exam_questions_bulk,
    delete_mock_exam,
    finish_mock_exam,
    generate_mock_exam_placeholders,
    get_mock_exam,
    get_mock_exam_results,
    get_mock_exam_summary,
    list_mock_exam_questions,
    list_mock_exams,
    start_mock_exam,
    update_mock_exam_question,
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


@router.get("/{exam_id}/questions", response_model=list[MockExamQuestionResponse])
def read_mock_exam_questions(exam_id: int) -> list[MockExamQuestionResponse]:
    with get_session() as session:
        try:
            return list_mock_exam_questions(session, exam_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{exam_id}/questions/bulk", response_model=list[MockExamQuestionResponse])
def create_mock_exam_questions(exam_id: int, payload: MockExamQuestionBulkCreate) -> list[MockExamQuestionResponse]:
    with get_session() as session:
        try:
            return create_mock_exam_questions_bulk(session, exam_id, payload)
        except ValueError as exc:
            message = str(exc)
            status_code = 404 if "nao encontrado" in message else 400
            raise HTTPException(status_code=status_code, detail=message) from exc


@router.post("/{exam_id}/questions/generate-placeholders", response_model=MockExamPlaceholderResponse)
def generate_mock_exam_questions_placeholders(
    exam_id: int,
    payload: MockExamPlaceholderRequest,
) -> MockExamPlaceholderResponse:
    with get_session() as session:
        try:
            return generate_mock_exam_placeholders(session, exam_id, payload)
        except ValueError as exc:
            message = str(exc)
            status_code = 404 if "nao encontrado" in message else 400
            raise HTTPException(status_code=status_code, detail=message) from exc


@router.put("/{exam_id}/questions/{question_id}", response_model=MockExamQuestionResponse)
def update_mock_exam_question_route(
    exam_id: int,
    question_id: int,
    payload: MockExamQuestionUpdate,
) -> MockExamQuestionResponse:
    with get_session() as session:
        try:
            return update_mock_exam_question(session, exam_id, question_id, payload)
        except ValueError as exc:
            message = str(exc)
            status_code = 404 if "nao encontrado" in message else 400
            raise HTTPException(status_code=status_code, detail=message) from exc


@router.post("/{exam_id}/start", response_model=MockExamStartResponse)
def start_mock_exam_route(exam_id: int) -> MockExamStartResponse:
    with get_session() as session:
        try:
            return start_mock_exam(session, exam_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{exam_id}/finish", response_model=MockExamFinishResponse)
def finish_mock_exam_route(exam_id: int) -> MockExamFinishResponse:
    with get_session() as session:
        try:
            return finish_mock_exam(session, exam_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{exam_id}/results", response_model=MockExamResultsResponse)
def read_mock_exam_results(exam_id: int) -> MockExamResultsResponse:
    with get_session() as session:
        try:
            return get_mock_exam_results(session, exam_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


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
