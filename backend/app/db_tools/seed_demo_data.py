from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict, dataclass
from datetime import date, datetime, time, timedelta
from typing import Any
from urllib.parse import urlparse

from sqlmodel import Session, select

from app.db import get_session, init_db
from app.models import (
    Block,
    BlockMastery,
    BlockProgress,
    BlockSubject,
    DailyStudyPlan,
    DailyStudyPlanItem,
    QuestionAttempt,
    Review,
    StudyCapacity,
    StudyEvent,
    Subject,
)
from app.schemas import BlockProgressDecisionRequest
from app.services.block_decision_service import save_block_progress_decision
from app.services.mastery_service import recalculate_block_mastery
from app.services.progression_service import sync_progression
from app.services.study_event_service import record_study_event
from app.settings import get_database_url, is_sqlite_database_url


DEMO_MARKER = "DEMO_SEED_FRONTEND_DEV"
DEFAULT_PLAN_TOTAL = 26
DEFAULT_PLAN_SPLIT = (12, 8, 6)
PREFERRED_DISCIPLINES = ("Biologia", "Matemática", "Química")


@dataclass(frozen=True)
class DemoTarget:
    discipline: str
    block_id: int
    block_name: str
    block_order: int
    subject_id: int
    subject_name: str


@dataclass(frozen=True)
class DemoSelection:
    anchor_focus: DemoTarget
    anchor_approval: DemoTarget
    anchor_next: DemoTarget
    math_focus: DemoTarget
    chemistry_focus: DemoTarget


def _marker_payload(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = {
        "seed_marker": DEMO_MARKER,
        "seed_kind": "frontend_dev",
    }
    if extra:
        payload.update(extra)
    return payload


def _subject_label(subject: Subject) -> str:
    if subject.subassunto:
        return f"{subject.assunto} - {subject.subassunto}"
    return subject.assunto


def _demo_note(label: str) -> str:
    return f"{label} [{DEMO_MARKER}]"


def _masked_target() -> str:
    database_url = get_database_url()
    if is_sqlite_database_url(database_url):
        return database_url
    parsed = urlparse(database_url)
    password = parsed.password or ""
    return database_url.replace(password, "***") if password else database_url


def _scalar_count(session: Session, model: type[Any]) -> int:
    return len(session.exec(select(model)).all())


def _table_counts(session: Session) -> dict[str, int]:
    return {
        "question_attempts": _scalar_count(session, QuestionAttempt),
        "reviews": _scalar_count(session, Review),
        "study_events": _scalar_count(session, StudyEvent),
        "daily_study_plan": _scalar_count(session, DailyStudyPlan),
        "daily_study_plan_items": _scalar_count(session, DailyStudyPlanItem),
        "block_progress": _scalar_count(session, BlockProgress),
        "block_mastery": _scalar_count(session, BlockMastery),
    }


def _find_demo_marker(session: Session) -> bool:
    if session.exec(select(QuestionAttempt.id).where(QuestionAttempt.source == DEMO_MARKER)).first() is not None:
        return True
    if session.exec(
        select(StudyEvent.id).where(StudyEvent.metadata_json.contains(DEMO_MARKER))
    ).first() is not None:
        return True
    if session.exec(
        select(DailyStudyPlanItem.id).where(DailyStudyPlanItem.primary_reason.contains(DEMO_MARKER))
    ).first() is not None:
        return True
    return False


def _blocks_for_discipline(session: Session, discipline: str) -> list[Block]:
    return session.exec(
        select(Block)
        .where(Block.disciplina == discipline)
        .order_by(Block.ordem, Block.id)
    ).all()


def _subjects_for_block(session: Session, block_id: int) -> list[Subject]:
    links = session.exec(
        select(BlockSubject).where(BlockSubject.block_id == block_id).order_by(BlockSubject.id)
    ).all()
    subjects: list[Subject] = []
    for link in links:
        subject = session.get(Subject, link.subject_id)
        if subject is None or subject.id is None or not subject.ativo:
            continue
        subjects.append(subject)
    return subjects


def _make_target(block: Block, subject: Subject) -> DemoTarget:
    return DemoTarget(
        discipline=block.disciplina,
        block_id=block.id or 0,
        block_name=block.nome,
        block_order=block.ordem,
        subject_id=subject.id or 0,
        subject_name=_subject_label(subject),
    )


def _pick_anchor_selection(session: Session) -> tuple[DemoTarget, DemoTarget, DemoTarget]:
    for discipline in PREFERRED_DISCIPLINES:
        blocks = _blocks_for_discipline(session, discipline)
        if len(blocks) < 2:
            continue
        first_block, next_block = blocks[0], blocks[1]
        if first_block.id is None or next_block.id is None:
            continue
        first_subjects = _subjects_for_block(session, first_block.id)
        next_subjects = _subjects_for_block(session, next_block.id)
        if len(first_subjects) < 2 or not next_subjects:
            continue
        return (
            _make_target(first_block, first_subjects[0]),
            _make_target(first_block, first_subjects[1]),
            _make_target(next_block, next_subjects[0]),
        )

    raise RuntimeError("Nao foi possivel localizar uma disciplina ancora com dois blocos e subjects suficientes.")


def _pick_discipline_target(session: Session, discipline: str) -> DemoTarget:
    blocks = _blocks_for_discipline(session, discipline)
    for block in blocks:
        if block.id is None:
            continue
        subjects = _subjects_for_block(session, block.id)
        if subjects:
            return _make_target(block, subjects[0])
    raise RuntimeError(f"Nao foi possivel localizar target demo para {discipline}.")


def _build_selection(session: Session) -> DemoSelection:
    anchor_focus, anchor_approval, anchor_next = _pick_anchor_selection(session)
    math_focus = _pick_discipline_target(session, "Matemática")
    chemistry_focus = _pick_discipline_target(session, "Química")
    return DemoSelection(
        anchor_focus=anchor_focus,
        anchor_approval=anchor_approval,
        anchor_next=anchor_next,
        math_focus=math_focus,
        chemistry_focus=chemistry_focus,
    )


def _ensure_capacity(session: Session, now: datetime) -> None:
    existing = session.exec(select(StudyCapacity).order_by(StudyCapacity.id)).first()
    if existing is not None:
        return
    session.add(
        StudyCapacity(
            current_load_level=2,
            recent_fatigue_score=0.28,
            recent_completion_rate=0.81,
            recent_overtime_rate=0.18,
            updated_at=now,
        )
    )
    session.commit()


def _create_attempts(
    session: Session,
    *,
    target: DemoTarget,
    attempts_date: date,
    batches: list[tuple[str, int, int]],
    confidence: int,
    elapsed_seconds: int,
    error_type: str,
    note_label: str,
    created_at: datetime,
) -> dict[str, Any]:
    created_attempts: list[QuestionAttempt] = []
    correct_total = 0
    incorrect_total = 0

    for difficulty, total, correct_count in batches:
        for index in range(total):
            attempt = QuestionAttempt(
                data=attempts_date,
                source=DEMO_MARKER,
                disciplina=target.discipline,
                block_id=target.block_id,
                subject_id=target.subject_id,
                dificuldade_banco=difficulty,
                dificuldade_pessoal=difficulty,
                acertou=index < correct_count,
                tempo_segundos=elapsed_seconds,
                confianca=confidence,
                tipo_erro=None if index < correct_count else error_type,
                observacoes=_demo_note(note_label),
            )
            session.add(attempt)
            created_attempts.append(attempt)
        correct_total += correct_count
        incorrect_total += total - correct_count

    session.flush()
    mastery = recalculate_block_mastery(session, target.block_id)
    record_study_event(
        session,
        event_type="question_attempt_bulk",
        title=f"Questoes registradas em {target.discipline}",
        description=(
            f"{len(created_attempts)} tentativas demo registradas em "
            f"{target.block_name} - {target.subject_name}."
        ),
        discipline=target.discipline,
        block_id=target.block_id,
        subject_id=target.subject_id,
        metadata=_marker_payload(
            {
                "created_attempts": len(created_attempts),
                "correct_count": correct_total,
                "incorrect_count": incorrect_total,
                "attempt_date": attempts_date.isoformat(),
                "mastery_status": mastery.status,
                "mastery_score": mastery.score_domino,
                "source": DEMO_MARKER,
                "demo_label": note_label,
            }
        ),
        created_at=created_at,
    )
    session.commit()
    return {
        "created_attempts": len(created_attempts),
        "correct_count": correct_total,
        "incorrect_count": incorrect_total,
        "mastery_status": mastery.status,
        "mastery_score": mastery.score_domino,
    }


def _upsert_demo_review(
    session: Session,
    *,
    target: DemoTarget,
    today: date,
    created_at: datetime,
) -> Review:
    review = session.exec(
        select(Review)
        .where(Review.subject_id == target.subject_id)
        .where(Review.block_id == target.block_id)
        .where(Review.status == "pendente")
    ).first()
    if review is None:
        review = Review(subject_id=target.subject_id, block_id=target.block_id, proxima_data=today)
    review.ultima_data = today - timedelta(days=1)
    review.proxima_data = today
    review.status = "pendente"
    review.resultado = "erro"
    review.intervalo_dias = 1
    session.add(review)
    session.flush()
    record_study_event(
        session,
        event_type="review_upsert",
        title=f"Revisao atualizada para {target.subject_name}",
        description=f"Revisao demo de {target.block_name} programada para {today.isoformat()}.",
        discipline=target.discipline,
        block_id=target.block_id,
        subject_id=target.subject_id,
        metadata=_marker_payload(
            {
                "review_id": review.id,
                "status": review.status,
                "result": review.resultado,
                "next_review_date": review.proxima_data.isoformat(),
            }
        ),
        created_at=created_at,
    )
    session.commit()
    return review


def _tag_new_events(session: Session, *, after_id: int) -> int:
    new_events = session.exec(select(StudyEvent).where(StudyEvent.id > after_id).order_by(StudyEvent.id)).all()
    for event in new_events:
        try:
            metadata = json.loads(event.metadata_json) if event.metadata_json else {}
        except json.JSONDecodeError:
            metadata = {"raw_metadata": event.metadata_json}
        if not isinstance(metadata, dict):
            metadata = {"value": metadata}
        metadata.update(_marker_payload())
        event.metadata_json = json.dumps(metadata, ensure_ascii=True, sort_keys=True)
        session.add(event)
    if new_events:
        session.commit()
    return len(new_events)


def _max_event_id(session: Session) -> int:
    events = session.exec(select(StudyEvent).order_by(StudyEvent.id.desc()).limit(1)).all()
    if not events:
        return 0
    return int(events[0].id or 0)


def _apply_progression_transition(session: Session, selection: DemoSelection, today: date) -> dict[str, Any]:
    sync_progression(session, today, discipline_filter=selection.anchor_focus.discipline)
    before_event_id = _max_event_id(session)
    response = save_block_progress_decision(
        session,
        BlockProgressDecisionRequest(
            discipline=selection.anchor_focus.discipline,
            block_id=selection.anchor_focus.block_id,
            user_decision="mixed_transition",
        ),
    )
    tagged_events = _tag_new_events(session, after_id=before_event_id)
    return {
        "discipline": response.discipline,
        "block_id": response.block_id,
        "saved_decision": response.saved_decision,
        "current_status": response.current_status,
        "next_block_id": response.next_block_id,
        "tagged_events": tagged_events,
    }


def _create_demo_plan(
    session: Session,
    *,
    selection: DemoSelection,
    created_at: datetime,
) -> dict[str, Any]:
    plan = DailyStudyPlan(
        created_at=created_at,
        total_planned_questions=DEFAULT_PLAN_TOTAL,
        status="active",
    )
    session.add(plan)
    session.flush()
    targets = [
        (selection.anchor_next, DEFAULT_PLAN_SPLIT[0], 0.96, "Consolidar transicao biologica"),
        (selection.math_focus, DEFAULT_PLAN_SPLIT[1], 0.88, "Retomar base matematica"),
        (selection.chemistry_focus, DEFAULT_PLAN_SPLIT[2], 0.82, "Manter natureza aquecida"),
    ]
    for target, planned_questions, score, reason in targets:
        session.add(
            DailyStudyPlanItem(
                plan_id=plan.id or 0,
                discipline=target.discipline,
                block_id=target.block_id,
                subject_id=target.subject_id,
                planned_questions=planned_questions,
                priority_score=score,
                primary_reason=f"{reason} [{DEMO_MARKER}]",
                planned_mode="aprendizado",
            )
        )
    session.flush()
    record_study_event(
        session,
        event_type="daily_plan_generated",
        title="Plano diario gerado",
        description="Plano demo gerado para frontend com 26 questoes em 3 focos.",
        metadata=_marker_payload(
            {
                "plan_id": plan.id,
                "status": plan.status,
                "total_planned_questions": plan.total_planned_questions,
                "focus_count": 3,
            }
        ),
        created_at=created_at,
    )
    session.commit()
    return {
        "plan_id": plan.id,
        "items_created": 3,
        "total_planned_questions": plan.total_planned_questions,
    }


def _selection_summary(selection: DemoSelection) -> dict[str, Any]:
    return {
        "anchor_focus": asdict(selection.anchor_focus),
        "anchor_approval": asdict(selection.anchor_approval),
        "anchor_next": asdict(selection.anchor_next),
        "math_focus": asdict(selection.math_focus),
        "chemistry_focus": asdict(selection.chemistry_focus),
    }


def _apply_seed(session: Session, selection: DemoSelection) -> dict[str, Any]:
    today = date.today()
    now = datetime.now()
    _ensure_capacity(session, now)

    payloads = {
        "anchor_partial_attempts": _create_attempts(
            session,
            target=selection.anchor_focus,
            attempts_date=today,
            batches=[("media", 5, 3)],
            confidence=3,
            elapsed_seconds=420,
            error_type="distracao",
            note_label="bio_anchor_partial",
            created_at=datetime.combine(today, time(hour=8, minute=45)),
        ),
        "anchor_approval_attempts": _create_attempts(
            session,
            target=selection.anchor_approval,
            attempts_date=today,
            batches=[("facil", 15, 13), ("media", 12, 9), ("dificil", 6, 3)],
            confidence=4,
            elapsed_seconds=480,
            error_type="conteudo",
            note_label="bio_anchor_approval",
            created_at=datetime.combine(today, time(hour=9, minute=20)),
        ),
        "math_attempts": _create_attempts(
            session,
            target=selection.math_focus,
            attempts_date=today,
            batches=[("media", 8, 5)],
            confidence=3,
            elapsed_seconds=360,
            error_type="calculo",
            note_label="math_focus_demo",
            created_at=datetime.combine(today, time(hour=10, minute=5)),
        ),
        "chemistry_attempts": _create_attempts(
            session,
            target=selection.chemistry_focus,
            attempts_date=today,
            batches=[("media", 6, 4)],
            confidence=3,
            elapsed_seconds=390,
            error_type="conceito",
            note_label="chemistry_focus_demo",
            created_at=datetime.combine(today, time(hour=10, minute=40)),
        ),
    }
    review = _upsert_demo_review(
        session,
        target=selection.math_focus,
        today=today,
        created_at=datetime.combine(today, time(hour=11, minute=15)),
    )
    transition = _apply_progression_transition(session, selection, today)
    plan = _create_demo_plan(session, selection=selection, created_at=datetime.combine(today, time(hour=11, minute=45)))
    return {
        "attempts": payloads,
        "review_id": review.id,
        "transition": transition,
        "plan": plan,
    }


def _build_report(session: Session, selection: DemoSelection) -> dict[str, Any]:
    return {
        "target_database": _masked_target(),
        "demo_marker": DEMO_MARKER,
        "already_seeded": _find_demo_marker(session),
        "selected_targets": _selection_summary(selection),
        "counts": _table_counts(session),
        "warnings": [
            "O seed nao apaga dados existentes.",
            "Se houver um plano real ativo hoje, o plano demo pode virar o mais recente e aparecer em /api/study-plan/today.",
        ],
    }


def _allow_apply() -> bool:
    return os.getenv("STUDY_HUB_ALLOW_DEMO_SEED", "").strip().casefold() == "true"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Cria um dataset demo controlado para desenvolvimento de frontend.")
    parser.add_argument("--dry-run", action="store_true", help="Mostra o que seria feito sem gravar no banco.")
    parser.add_argument("--apply", action="store_true", help="Aplica o seed demo no banco configurado.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    mode = "apply" if args.apply else "dry-run"
    if args.apply and not _allow_apply():
        raise SystemExit(
            "Aplicacao bloqueada. Defina STUDY_HUB_ALLOW_DEMO_SEED=true junto com --apply para gravar dados demo."
        )

    init_db()
    with get_session() as session:
        selection = _build_selection(session)
        report = _build_report(session, selection)
        report["mode"] = mode

        if mode == "dry-run":
            print(json.dumps(report, indent=2, ensure_ascii=False))
            return

        if report["already_seeded"]:
            report["skipped"] = True
            report["reason"] = "Seed demo já detectado no banco. Nenhum dado novo foi criado."
            print(json.dumps(report, indent=2, ensure_ascii=False))
            return

        before_counts = report["counts"]
        apply_details = _apply_seed(session, selection)
        after_report = _build_report(session, selection)
        output = {
            **report,
            "skipped": False,
            "counts_before": before_counts,
            "counts_after": after_report["counts"],
            "apply_details": apply_details,
        }
        print(json.dumps(output, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
