from __future__ import annotations

import json
from datetime import date

from sqlmodel import Session, select

from app.models import Block, MockExam, MockExamQuestion, QuestionAttempt, Subject
from app.schemas import QuestionAttemptBulkCreate, QuestionAttemptBulkCreateResponse
from app.services.free_study_service import get_free_study_subject_context
from app.services.mastery_service import recalculate_block_mastery
from app.services.review_service import upsert_review_from_attempt
from app.services.study_event_service import record_study_event


VALID_DIFFICULTIES = {"facil", "media", "dificil"}


def _parse_date(value: str | None) -> date:
    if value is None:
        return date.today()
    return date.fromisoformat(value)


def _difficulty(value: str | None, default: str = "media") -> str:
    normalized = (value or default).strip().lower()
    if normalized == "medio":
        normalized = "media"
    if normalized not in VALID_DIFFICULTIES:
        return default
    return normalized


def _difficulty_from_peer_accuracy(value: object, default: str) -> str:
    if not isinstance(value, (int, float)):
        return default
    if value >= 65:
        return "facil"
    if value >= 45:
        return "media"
    return "dificil"


def _confidence_value(value: str | None) -> int | None:
    normalized = (value or "").strip().lower()
    if normalized == "baixa":
        return 2
    if normalized == "media":
        return 3
    if normalized == "alta":
        return 5
    return None


def _impact_message(status: str | None, score: float | None) -> str:
    if status == "aprovado":
        return "Bloco aprovado. Bom avanco na trilha."
    if status == "em_risco":
        return "Assunto ainda precisa de reforco."
    if score is not None and score >= 0.55:
        return "Bom progresso no pre-requisito central."
    return "Bloco avancou, mas ainda nao foi aprovado."


def _seconds_per_correct_question(total_elapsed_seconds: int | None, correct_count: int) -> int | None:
    if total_elapsed_seconds is None or total_elapsed_seconds <= 0 or correct_count <= 0:
        return None
    return round(total_elapsed_seconds / correct_count)


def _subject_label(subject: Subject) -> str:
    if subject.subassunto:
        return f"{subject.assunto} - {subject.subassunto}"
    return subject.assunto


def _get_saved_bank_mock_exam_id(session: Session, discipline: str) -> int:
    saved_bank = session.exec(
        select(MockExam).where(MockExam.tipo == "saved_bank", MockExam.mode == "saved_bank", MockExam.area == discipline),
    ).first()
    if saved_bank is None:
        saved_bank = MockExam(
            tipo="saved_bank",
            area=discipline,
            mode="saved_bank",
            status="active",
            total_questoes=1,
            total_acertos=0,
            observacoes="Banco global de questoes salvas pelo Timer V2.",
        )
        session.add(saved_bank)
        session.flush()
        session.refresh(saved_bank)
    if saved_bank.id is None:
        raise ValueError("Banco de questoes salvas nao foi inicializado.")
    return saved_bank.id


def register_question_attempts_bulk(
    session: Session,
    payload: QuestionAttemptBulkCreate,
) -> QuestionAttemptBulkCreateResponse:
    block = session.get(Block, payload.block_id)
    subject = session.get(Subject, payload.subject_id)
    if block is None:
        raise ValueError("Bloco nao encontrado.")
    if subject is None:
        raise ValueError("Assunto nao encontrado.")
    if payload.quantity < 1:
        raise ValueError("A quantidade deve ser maior que zero.")
    if payload.correct_count < 0 or payload.correct_count > payload.quantity:
        raise ValueError("Acertos deve ficar entre zero e a quantidade feita.")

    attempt_date = _parse_date(payload.date)
    difficulty_bank = _difficulty(payload.difficulty_bank)
    difficulty_personal = _difficulty(payload.difficulty_personal, default=difficulty_bank)
    confidence = _confidence_value(payload.confidence)
    seconds_per_correct_question = _seconds_per_correct_question(payload.elapsed_seconds, payload.correct_count)
    created_attempts: list[QuestionAttempt] = []
    sentinel_exam_id: int | None = None

    for index in range(payload.quantity):
        # A grade de gabarito da V2 pode enviar telemetria item a item.
        # Sem esses vetores, o comportamento proporcional antigo e preservado.
        is_correct = index < payload.correct_count
        if payload.results_vector and index < len(payload.results_vector):
            is_correct = payload.results_vector[index]

        item_subject_id = payload.subject_id
        if payload.subject_ids_vector and index < len(payload.subject_ids_vector):
            if payload.subject_ids_vector[index] is not None:
                item_subject_id = payload.subject_ids_vector[index]

        item_time = seconds_per_correct_question if is_correct else None
        if payload.times_vector and index < len(payload.times_vector):
            item_time = payload.times_vector[index]

        item_notes = payload.notes
        if payload.saved_items_meta and str(index) in payload.saved_items_meta:
            meta = payload.saved_items_meta[str(index)]
            item_notes = f"Questao favoritada e arquivada no banco de revisoes. Nota tatica: {meta.get('tacticalNote', '')}"
            item_difficulty_personal = _difficulty_from_peer_accuracy(meta.get("peerAccuracyPercent"), difficulty_personal)
            if sentinel_exam_id is None:
                sentinel_exam_id = _get_saved_bank_mock_exam_id(session, payload.discipline)

            saved_q = MockExamQuestion(
                mock_exam_id=sentinel_exam_id,
                question_number=index + 1,
                source_type="saved_bank",
                discipline=payload.discipline,
                subject_id=item_subject_id,
                block_id=payload.block_id,
                prompt_markdown=json.dumps(meta.get("blocks", []), ensure_ascii=False),
                alternatives_json=json.dumps(meta.get("alternatives", []), ensure_ascii=False),
                correct_answer=meta.get("correctAlternativeLetter"),
                user_answer=meta.get("userAlternativeLetter"),
                is_correct=is_correct,
                difficulty_percent=meta.get("peerAccuracyPercent"),
                time_seconds=item_time,
                notes=meta.get("tacticalNote"),
            )
            session.add(saved_q)
        else:
            item_difficulty_personal = difficulty_personal

        attempt = QuestionAttempt(
            data=attempt_date,
            source=payload.source,
            disciplina=payload.discipline,
            block_id=payload.block_id,
            subject_id=item_subject_id,
            dificuldade_banco=difficulty_bank,
            dificuldade_pessoal=item_difficulty_personal,
            acertou=is_correct,
            tempo_segundos=item_time,
            confianca=confidence,
            tipo_erro=None if is_correct else payload.error_type,
            observacoes=item_notes,
        )
        session.add(attempt)
        created_attempts.append(attempt)

    session.flush()
    for attempt in created_attempts:
        session.refresh(attempt)

    mastery = recalculate_block_mastery(session, payload.block_id, current_attempts=created_attempts)
    review = upsert_review_from_attempt(session, created_attempts[-1])
    subject_name = _subject_label(subject)
    correct_count = sum(1 for attempt in created_attempts if attempt.acertou)
    metadata_extra = {"study_mode": payload.study_mode}
    event_title = f"Questoes registradas em {payload.discipline}"
    if payload.study_mode == "free":
        free_context = get_free_study_subject_context(session, payload.subject_id)
        metadata_extra.update(
            {
                "roadmap_node_id": free_context.roadmap_node_id,
                "warning_level": free_context.warning_level,
            }
        )
        event_title = f"Questoes livres registradas em {payload.discipline}"

    record_study_event(
        session,
        event_type="question_attempt_bulk",
        title=event_title,
        description=f"{payload.quantity} tentativas registradas em {block.nome} - {subject_name}.",
        discipline=payload.discipline,
        block_id=payload.block_id,
        subject_id=payload.subject_id,
        metadata={
            **metadata_extra,
            "created_attempts": len(created_attempts),
            "correct_count": correct_count,
            "incorrect_count": payload.quantity - correct_count,
            "attempt_date": attempt_date.isoformat(),
            "difficulty_bank": difficulty_bank,
            "difficulty_personal": difficulty_personal,
            "source": payload.source,
            "mastery_status": mastery.status,
            "mastery_score": mastery.score_domino,
            "next_review_date": review.proxima_data.isoformat() if review is not None else None,
            "attempt_ids": [attempt.id for attempt in created_attempts],
        },
    )
    session.commit()
    session.refresh(mastery)

    return QuestionAttemptBulkCreateResponse(
        created_attempts=len(created_attempts),
        block_id=payload.block_id,
        subject_id=payload.subject_id,
        mastery_status=mastery.status,
        mastery_score=mastery.score_domino,
        next_review_date=review.proxima_data.isoformat() if review is not None else None,
        impact_message=_impact_message(mastery.status, mastery.score_domino),
    )
