from __future__ import annotations

import json
from datetime import date, datetime
from statistics import mean
from typing import Any

from sqlmodel import Session, delete, select

from app.models import MockExam, MockExamQuestion
from app.schemas import (
    MockExamAreaResult,
    MockExamAreaSummary,
    MockExamCreate,
    MockExamFinishResponse,
    MockExamPlaceholderRequest,
    MockExamPlaceholderResponse,
    MockExamQuestionBulkCreate,
    MockExamQuestionCreate,
    MockExamQuestionResponse,
    MockExamQuestionUpdate,
    MockExamResponse,
    MockExamResultsResponse,
    MockExamStartResponse,
    MockExamSummaryResponse,
    MockExamUpdate,
)

ENEM_2019_AVERAGE_SCORE_BY_CORRECT_COUNT: dict[str, dict[int, float]] = {
    "matematica": {
        0: 102.2,
        2: 375.6,
        5: 430.0,
        8: 486.0,
        10: 512.0,
        12: 532.7,
        15: 575.0,
        20: 646.0,
        25: 720.0,
        30: 790.0,
        35: 850.0,
        40: 905.0,
        45: 960.0,
    },
    "natureza": {
        0: 230.0,
        2: 341.7,
        5: 378.0,
        8: 418.0,
        10: 446.0,
        12: 475.0,
        15: 515.0,
        20: 573.0,
        25: 630.0,
        30: 680.0,
        35: 725.0,
        40: 770.0,
        45: 820.0,
    },
    "humanas": {
        0: 225.0,
        2: 335.6,
        5: 372.0,
        8: 414.0,
        10: 452.0,
        12: 485.0,
        15: 530.0,
        20: 590.0,
        25: 646.0,
        30: 694.0,
        35: 735.0,
        40: 775.0,
        45: 815.0,
    },
    "linguagens": {
        0: 220.0,
        2: 340.7,
        5: 376.0,
        8: 420.0,
        10: 468.0,
        12: 500.0,
        15: 538.0,
        20: 588.0,
        25: 632.0,
        30: 675.0,
        35: 715.0,
        40: 755.0,
        45: 795.0,
    },
}

AREA_ALIASES: dict[str, str] = {
    "matematica": "matematica",
    "matemática": "matematica",
    "natureza": "natureza",
    "humanas": "humanas",
    "linguagens": "linguagens",
    "redacao": "linguagens",
    "redação": "linguagens",
    "geral": "humanas",
}


def _utcnow() -> datetime:
    return datetime.utcnow()


def _parse_exam_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Informe uma data valida no formato YYYY-MM-DD.") from exc


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError("Informe datetime valido em formato ISO-8601.") from exc
    return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed


def _validate_counts(total_questions: int, correct_count: int) -> None:
    if total_questions <= 0:
        raise ValueError("Total de questoes deve ser maior que zero.")
    if correct_count < 0:
        raise ValueError("Acertos nao pode ser negativo.")
    if correct_count > total_questions:
        raise ValueError("Acertos nao pode ser maior que o total de questoes.")


def _validate_question_payload(
    *,
    difficulty_percent: float | None,
    time_seconds: int | None,
) -> None:
    if difficulty_percent is not None and (difficulty_percent < 0 or difficulty_percent > 100):
        raise ValueError("difficulty_percent deve ficar entre 0 e 100.")
    if time_seconds is not None and time_seconds < 0:
        raise ValueError("time_seconds nao pode ser negativo.")


def _accuracy_from_counts(correct_count: int, total_questions: int) -> float:
    if total_questions <= 0:
        return 0.0
    return correct_count / total_questions


def _accuracy(exam: MockExam) -> float:
    return _accuracy_from_counts(exam.total_acertos, exam.total_questoes)


def _alternatives_json(alternatives: list[str] | None) -> str | None:
    if not alternatives:
        return None
    return json.dumps(alternatives, ensure_ascii=True)


def _alternatives(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [item for item in parsed if isinstance(item, str)] if isinstance(parsed, list) else []


def _question_correctness(
    *,
    user_answer: str | None,
    correct_answer: str | None,
    skipped: bool,
) -> bool | None:
    if skipped:
        return None
    if not user_answer or not correct_answer:
        return None
    return user_answer.strip().upper() == correct_answer.strip().upper()


def _to_response(exam: MockExam) -> MockExamResponse:
    return MockExamResponse(
        id=exam.id or 0,
        exam_date=exam.data.isoformat(),
        title=exam.tipo,
        area=exam.area,  # type: ignore[arg-type]
        mode=exam.mode,  # type: ignore[arg-type]
        status=exam.status,  # type: ignore[arg-type]
        total_questions=exam.total_questoes,
        correct_count=exam.total_acertos,
        accuracy=_accuracy(exam),
        tri_score=exam.tri_score,
        official_tri_score=exam.tri_score,
        estimated_tri_score=exam.estimated_tri_score,
        duration_minutes=exam.tempo_total_min,
        notes=exam.observacoes,
        started_at=exam.started_at.isoformat() if exam.started_at else None,
        finished_at=exam.finished_at.isoformat() if exam.finished_at else None,
        created_at=exam.created_at.isoformat(),
        updated_at=exam.updated_at.isoformat(),
    )


def _to_question_response(question: MockExamQuestion) -> MockExamQuestionResponse:
    return MockExamQuestionResponse(
        id=question.id or 0,
        mock_exam_id=question.mock_exam_id,
        question_number=question.question_number,
        question_code=question.question_code,
        area=question.area,
        discipline=question.discipline,
        subject_id=question.subject_id,
        block_id=question.block_id,
        source_type=question.source_type,  # type: ignore[arg-type]
        prompt_markdown=question.prompt_markdown,
        alternatives=_alternatives(question.alternatives_json),
        correct_answer=question.correct_answer,
        user_answer=question.user_answer,
        is_correct=question.is_correct,
        skipped=question.skipped,
        difficulty_percent=question.difficulty_percent,
        time_seconds=question.time_seconds,
        started_at=question.started_at.isoformat() if question.started_at else None,
        answered_at=question.answered_at.isoformat() if question.answered_at else None,
        notes=question.notes,
        created_at=question.created_at.isoformat(),
        updated_at=question.updated_at.isoformat(),
    )


def _get_exam_or_raise(session: Session, exam_id: int) -> MockExam:
    exam = session.get(MockExam, exam_id)
    if exam is None:
        raise ValueError("Simulado nao encontrado.")
    return exam


def _get_question_or_raise(session: Session, exam_id: int, question_id: int) -> MockExamQuestion:
    question = session.get(MockExamQuestion, question_id)
    if question is None or question.mock_exam_id != exam_id:
        raise ValueError("Questao do simulado nao encontrada.")
    return question


def _list_question_rows(session: Session, exam_id: int) -> list[MockExamQuestion]:
    return session.exec(
        select(MockExamQuestion)
        .where(MockExamQuestion.mock_exam_id == exam_id)
        .order_by(MockExamQuestion.question_number.asc(), MockExamQuestion.id.asc())
    ).all()


def _normalize_area_key(area: str | None) -> str:
    if not area:
        return "humanas"
    return AREA_ALIASES.get(area.strip().lower(), "humanas")


def _interpolate_score(reference: dict[int, float], correct_count: int) -> float:
    keys = sorted(reference.keys())
    if correct_count <= keys[0]:
        return reference[keys[0]]
    if correct_count >= keys[-1]:
        return reference[keys[-1]]

    lower_key = keys[0]
    upper_key = keys[-1]
    for index, key in enumerate(keys):
        if key == correct_count:
            return reference[key]
        if key < correct_count:
            lower_key = key
            continue
        upper_key = key
        break

    lower_score = reference[lower_key]
    upper_score = reference[upper_key]
    span = upper_key - lower_key
    ratio = (correct_count - lower_key) / span if span else 0.0
    return lower_score + (upper_score - lower_score) * ratio


def _difficulty_adjustment(questions: list[MockExamQuestion]) -> float:
    scored_questions = [question for question in questions if question.difficulty_percent is not None]
    if not scored_questions:
        return 0.0

    adjustment = 0.0
    for question in scored_questions:
        difficulty = question.difficulty_percent or 0.0
        hardness = (50 - difficulty) / 50
        if question.is_correct is True:
            adjustment += hardness * 3.2
        elif question.is_correct is False or question.skipped:
            easy_penalty = max(0.0, (difficulty - 50) / 50)
            adjustment -= easy_penalty * 3.2

    return max(-15.0, min(15.0, adjustment))


def _compute_estimated_tri(area: str, questions: list[MockExamQuestion]) -> float | None:
    if not questions:
        return None

    correct_count = sum(1 for question in questions if question.is_correct is True)
    total_questions = len(questions)
    normalized_correct = round((correct_count / total_questions) * 45) if total_questions > 0 else 0
    normalized_correct = max(0, min(45, normalized_correct))

    reference = ENEM_2019_AVERAGE_SCORE_BY_CORRECT_COUNT[_normalize_area_key(area)]
    base_score = _interpolate_score(reference, normalized_correct)
    difficulty_adjustment = _difficulty_adjustment(questions) or 0.0
    estimated = base_score + difficulty_adjustment
    floor = min(reference.values())
    ceiling = max(reference.values())
    return round(max(floor, min(ceiling, estimated)), 1)


def _build_results(session: Session, exam: MockExam) -> MockExamResultsResponse:
    questions = _list_question_rows(session, exam.id or 0)
    total_questions = len(questions)
    answered_questions = [question for question in questions if question.user_answer and not question.skipped]
    skipped_questions = [question for question in questions if question.skipped]
    correct_questions = [question for question in questions if question.is_correct is True]
    timed_questions = [question.time_seconds for question in questions if question.time_seconds is not None]
    timed_correct = [question.time_seconds for question in correct_questions if question.time_seconds is not None]

    grouped: dict[str, list[MockExamQuestion]] = {}
    for question in questions:
        area_key = question.area or question.discipline or exam.area or "Geral"
        grouped.setdefault(area_key, []).append(question)

    by_area: list[MockExamAreaResult] = []
    for area, area_questions in sorted(grouped.items(), key=lambda item: item[0]):
        answered = [question for question in area_questions if question.user_answer and not question.skipped]
        skipped = [question for question in area_questions if question.skipped]
        correct = [question for question in area_questions if question.is_correct is True]
        area_timed = [question.time_seconds for question in area_questions if question.time_seconds is not None]
        area_timed_correct = [question.time_seconds for question in correct if question.time_seconds is not None]
        area_difficulty = [question.difficulty_percent for question in area_questions if question.difficulty_percent is not None]
        by_area.append(
            MockExamAreaResult(
                area=area,
                total_questions=len(area_questions),
                answered_count=len(answered),
                skipped_count=len(skipped),
                correct_count=len(correct),
                accuracy=_accuracy_from_counts(len(correct), len(area_questions)),
                avg_time_seconds=round(mean(area_timed), 1) if area_timed else None,
                avg_time_correct_seconds=round(mean(area_timed_correct), 1) if area_timed_correct else None,
                average_difficulty_percent=round(mean(area_difficulty), 1) if area_difficulty else None,
                estimated_tri_score=_compute_estimated_tri(area, area_questions),
            )
        )

    area_scores = [item.estimated_tri_score for item in by_area if item.estimated_tri_score is not None]
    overall_area_average_score = round(mean(area_scores), 1) if area_scores else None

    return MockExamResultsResponse(
        exam=_to_response(exam),
        total_questions=total_questions,
        answered_count=len(answered_questions),
        skipped_count=len(skipped_questions),
        correct_count=len(correct_questions),
        accuracy=_accuracy_from_counts(len(correct_questions), total_questions),
        avg_time_seconds=round(mean(timed_questions), 1) if timed_questions else None,
        avg_time_correct_seconds=round(mean(timed_correct), 1) if timed_correct else None,
        official_tri_score=exam.tri_score,
        estimated_tri_score=exam.estimated_tri_score,
        overall_area_average_score=overall_area_average_score,
        by_area=by_area,
        questions=[_to_question_response(question) for question in questions],
    )


def list_mock_exams(session: Session) -> list[MockExamResponse]:
    rows = session.exec(select(MockExam).order_by(MockExam.data.desc(), MockExam.id.desc())).all()
    return [_to_response(row) for row in rows]


def get_mock_exam(session: Session, exam_id: int) -> MockExamResponse:
    return _to_response(_get_exam_or_raise(session, exam_id))


def create_mock_exam(session: Session, payload: MockExamCreate) -> MockExamResponse:
    exam_date = _parse_exam_date(payload.exam_date)
    _validate_counts(payload.total_questions, payload.correct_count)

    now = _utcnow()
    exam = MockExam(
        data=exam_date,
        tipo=payload.title.strip(),
        area=payload.area,
        mode=payload.mode,
        status="draft",
        total_questoes=payload.total_questions,
        total_acertos=payload.correct_count,
        tri_score=payload.tri_score,
        estimated_tri_score=None,
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
    exam = _get_exam_or_raise(session, exam_id)
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
    if "mode" in updates and payload.mode is not None:
        exam.mode = payload.mode
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

    exam.updated_at = _utcnow()
    session.add(exam)
    session.commit()
    session.refresh(exam)
    return _to_response(exam)


def delete_mock_exam(session: Session, exam_id: int) -> None:
    exam = _get_exam_or_raise(session, exam_id)
    session.exec(delete(MockExamQuestion).where(MockExamQuestion.mock_exam_id == exam_id))
    session.flush()
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


def list_mock_exam_questions(session: Session, exam_id: int) -> list[MockExamQuestionResponse]:
    _get_exam_or_raise(session, exam_id)
    return [_to_question_response(question) for question in _list_question_rows(session, exam_id)]


def create_mock_exam_questions_bulk(
    session: Session,
    exam_id: int,
    payload: MockExamQuestionBulkCreate,
) -> list[MockExamQuestionResponse]:
    exam = _get_exam_or_raise(session, exam_id)
    existing_numbers = {question.question_number for question in _list_question_rows(session, exam_id)}
    incoming_numbers = [question.question_number for question in payload.questions]
    if len(set(incoming_numbers)) != len(incoming_numbers):
        raise ValueError("Existem numeros de questoes duplicados no payload.")
    duplicates = existing_numbers.intersection(incoming_numbers)
    if duplicates:
        raise ValueError("Ja existem questoes cadastradas com esses numeros.")

    now = _utcnow()
    created_rows: list[MockExamQuestion] = []
    for question_payload in payload.questions:
        _validate_question_payload(
            difficulty_percent=question_payload.difficulty_percent,
            time_seconds=question_payload.time_seconds,
        )
        row = MockExamQuestion(
            mock_exam_id=exam.id or 0,
            question_number=question_payload.question_number,
            question_code=question_payload.question_code,
            area=question_payload.area,
            discipline=question_payload.discipline,
            subject_id=question_payload.subject_id,
            block_id=question_payload.block_id,
            source_type=question_payload.source_type,
            prompt_markdown=question_payload.prompt_markdown,
            alternatives_json=_alternatives_json(question_payload.alternatives),
            correct_answer=question_payload.correct_answer.strip().upper() if question_payload.correct_answer else None,
            user_answer=question_payload.user_answer.strip().upper() if question_payload.user_answer else None,
            skipped=question_payload.skipped,
            difficulty_percent=question_payload.difficulty_percent,
            time_seconds=question_payload.time_seconds,
            started_at=_parse_datetime(question_payload.started_at),
            answered_at=_parse_datetime(question_payload.answered_at),
            notes=question_payload.notes,
            created_at=now,
            updated_at=now,
        )
        row.is_correct = _question_correctness(
            user_answer=row.user_answer,
            correct_answer=row.correct_answer,
            skipped=row.skipped,
        )
        created_rows.append(row)
        session.add(row)

    exam.updated_at = now
    session.add(exam)
    session.commit()
    for row in created_rows:
        session.refresh(row)
    return [_to_question_response(row) for row in created_rows]


def generate_mock_exam_placeholders(
    session: Session,
    exam_id: int,
    payload: MockExamPlaceholderRequest,
) -> MockExamPlaceholderResponse:
    exam = _get_exam_or_raise(session, exam_id)
    if _list_question_rows(session, exam_id):
        raise ValueError("Este simulado ja possui questoes cadastradas.")

    if payload.total_questions != exam.total_questoes:
        exam.total_questoes = payload.total_questions

    covered_numbers: set[int] = set()
    now = _utcnow()
    for area_range in payload.areas:
        if area_range.end < area_range.start:
            raise ValueError("Cada faixa de area precisa ter end maior ou igual ao start.")
        for number in range(area_range.start, area_range.end + 1):
            if number > payload.total_questions:
                raise ValueError("Uma faixa ultrapassa o total de questoes.")
            if number in covered_numbers:
                raise ValueError("As faixas de area nao podem se sobrepor.")
            covered_numbers.add(number)
            session.add(
                MockExamQuestion(
                    mock_exam_id=exam.id or 0,
                    question_number=number,
                    area=area_range.area,
                    source_type="external",
                    created_at=now,
                    updated_at=now,
                )
            )

    for number in range(1, payload.total_questions + 1):
        if number in covered_numbers:
            continue
        session.add(
            MockExamQuestion(
                mock_exam_id=exam.id or 0,
                question_number=number,
                source_type="external",
                created_at=now,
                updated_at=now,
            )
        )

    exam.mode = "external"
    exam.updated_at = now
    session.add(exam)
    session.commit()
    return MockExamPlaceholderResponse(
        created_questions=payload.total_questions,
        total_questions=payload.total_questions,
        message="Questoes placeholder criadas para o simulado externo.",
    )


def update_mock_exam_question(
    session: Session,
    exam_id: int,
    question_id: int,
    payload: MockExamQuestionUpdate,
) -> MockExamQuestionResponse:
    exam = _get_exam_or_raise(session, exam_id)
    question = _get_question_or_raise(session, exam_id, question_id)
    _validate_question_payload(
        difficulty_percent=payload.difficulty_percent if "difficulty_percent" in payload.model_fields_set else question.difficulty_percent,
        time_seconds=payload.time_seconds if "time_seconds" in payload.model_fields_set else question.time_seconds,
    )

    updates = payload.model_dump(exclude_unset=True)
    if "question_code" in updates:
        question.question_code = payload.question_code
    if "area" in updates:
        question.area = payload.area
    if "discipline" in updates:
        question.discipline = payload.discipline
    if "subject_id" in updates:
        question.subject_id = payload.subject_id
    if "block_id" in updates:
        question.block_id = payload.block_id
    if "prompt_markdown" in updates:
        question.prompt_markdown = payload.prompt_markdown
    if "alternatives" in updates:
        question.alternatives_json = _alternatives_json(payload.alternatives)
    if "correct_answer" in updates:
        question.correct_answer = payload.correct_answer.strip().upper() if payload.correct_answer else None
    if "user_answer" in updates:
        question.user_answer = payload.user_answer.strip().upper() if payload.user_answer else None
    if "skipped" in updates and payload.skipped is not None:
        question.skipped = payload.skipped
    if "difficulty_percent" in updates:
        question.difficulty_percent = payload.difficulty_percent
    if "time_seconds" in updates:
        question.time_seconds = payload.time_seconds
    if "started_at" in updates:
        question.started_at = _parse_datetime(payload.started_at)
    if "answered_at" in updates:
        question.answered_at = _parse_datetime(payload.answered_at)
    elif {"user_answer", "correct_answer", "skipped"}.intersection(updates):
        question.answered_at = _utcnow()
    if "notes" in updates:
        question.notes = payload.notes

    question.is_correct = _question_correctness(
        user_answer=question.user_answer,
        correct_answer=question.correct_answer,
        skipped=question.skipped,
    )
    question.updated_at = _utcnow()
    exam.updated_at = question.updated_at
    session.add(question)
    session.add(exam)
    session.commit()
    session.refresh(question)
    return _to_question_response(question)


def start_mock_exam(session: Session, exam_id: int) -> MockExamStartResponse:
    exam = _get_exam_or_raise(session, exam_id)
    now = _utcnow()
    if exam.started_at is None:
        exam.started_at = now
    exam.status = "in_progress"
    exam.updated_at = now
    session.add(exam)
    session.commit()
    session.refresh(exam)
    return MockExamStartResponse(exam=_to_response(exam), questions_count=len(_list_question_rows(session, exam_id)))


def finish_mock_exam(session: Session, exam_id: int) -> MockExamFinishResponse:
    exam = _get_exam_or_raise(session, exam_id)
    if exam.started_at is None:
        exam.started_at = _utcnow()

    results = _build_results(session, exam)
    exam.status = "finished"
    exam.finished_at = _utcnow()
    exam.total_questoes = results.total_questions or exam.total_questoes
    exam.total_acertos = results.correct_count
    exam.estimated_tri_score = results.overall_area_average_score
    exam.result_json = json.dumps(results.model_dump(mode="json"), ensure_ascii=True, sort_keys=True)
    exam.updated_at = exam.finished_at
    session.add(exam)
    session.commit()
    session.refresh(exam)

    final_results = _build_results(session, exam)
    return MockExamFinishResponse(
        exam=final_results.exam,
        total_questions=final_results.total_questions,
        answered_count=final_results.answered_count,
        skipped_count=final_results.skipped_count,
        correct_count=final_results.correct_count,
        accuracy=final_results.accuracy,
        avg_time_seconds=final_results.avg_time_seconds,
        avg_time_correct_seconds=final_results.avg_time_correct_seconds,
        by_area=final_results.by_area,
    )


def get_mock_exam_results(session: Session, exam_id: int) -> MockExamResultsResponse:
    exam = _get_exam_or_raise(session, exam_id)
    return _build_results(session, exam)
