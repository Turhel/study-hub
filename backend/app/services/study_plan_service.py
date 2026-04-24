from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import func
from sqlmodel import Session, select

from app.core.rules import (
    PERSONAL_GAP_WEIGHTS,
    BLOCK_STATUS_ACTIVE,
    BLOCK_STATUS_READY_TO_ADVANCE,
    BLOCK_STATUS_TRANSITION,
    block_is_focus_status,
    block_planned_mode,
    historical_topic_weight,
    normalize_discipline_name,
    prerequisite_topic_weight,
    strategic_discipline_weight,
)
from app.models import (
    Block,
    BlockProgress,
    BlockSubject,
    DailyStudyPlan,
    DailyStudyPlanItem,
    QuestionAttempt,
    Subject,
    SubjectProgress,
)
from app.schemas import StudyPlanItem, StudyPlanRecalculateResponse, StudyPlanSummary, StudyPlanTodayResponse
from app.services.capacity_service import get_or_create_capacity, safe_daily_question_load
from app.services.discipline_normalization_service import normalize_discipline
from app.services.progression_service import sync_progression
from app.services.roadmap_progression_service import GuidedRoadmapOverview, build_guided_roadmap_overview
from app.services.study_event_service import record_study_event


@dataclass(frozen=True)
class StudyPlanCandidate:
    discipline: str
    strategic_discipline: str
    subarea: str
    block_id: int
    block_name: str
    block_order: int
    subject_id: int
    subject_name: str
    priority_score: float
    raw_score: float
    primary_reason: str
    planned_mode: str
    roadmap_node_id: str | None = None
    roadmap_mapped: bool = False
    roadmap_mapping_source: str | None = None
    roadmap_mapping_confidence: float | None = None
    roadmap_mapping_reason: str | None = None
    roadmap_status: str | None = None
    roadmap_reason: str | None = None


def _subject_label(subject: Subject) -> str:
    if subject.subassunto:
        return f"{subject.assunto} - {subject.subassunto}"
    return subject.assunto


def _latest_active_plan(session: Session, today: date) -> DailyStudyPlan | None:
    plans = session.exec(
        select(DailyStudyPlan)
        .where(DailyStudyPlan.status == "active")
        .order_by(DailyStudyPlan.created_at.desc())
    ).all()
    for plan in plans:
        if plan.created_at.date() == today:
            return plan
    return None


def _execution_progress(
    session: Session,
    today: date,
    block_id: int,
    subject_id: int,
    planned_questions: int,
) -> tuple[int, int, float, str]:
    completed_today = int(
        session.exec(
            select(func.count(QuestionAttempt.id))
            .where(QuestionAttempt.block_id == block_id)
            .where(QuestionAttempt.subject_id == subject_id)
            .where(QuestionAttempt.data == today)
        ).one()
        or 0
    )
    remaining_today = max(planned_questions - completed_today, 0)
    progress_ratio = min(completed_today / planned_questions, 1.0) if planned_questions > 0 else 0.0

    if completed_today == 0:
        execution_status = "nao_iniciado"
    elif completed_today < planned_questions:
        execution_status = "em_andamento"
    else:
        execution_status = "concluido"

    return completed_today, remaining_today, round(progress_ratio, 2), execution_status


def _items_for_plan(session: Session, plan: DailyStudyPlan, today: date) -> list[StudyPlanItem]:
    block_progress, _ = sync_progression(session, today)
    roadmap_overview = build_guided_roadmap_overview(session, block_progress)
    rows = session.exec(
        select(DailyStudyPlanItem)
        .where(DailyStudyPlanItem.plan_id == plan.id)
        .order_by(DailyStudyPlanItem.priority_score.desc(), DailyStudyPlanItem.id)
    ).all()

    items: list[StudyPlanItem] = []
    for row in rows:
        block = session.get(Block, row.block_id)
        subject = session.get(Subject, row.subject_id)
        normalized = normalize_discipline(subject.disciplina if subject else row.discipline)
        roadmap_block = roadmap_overview.block_eligibility.get(row.block_id)
        subject_state = roadmap_overview.subject_states.get(row.subject_id)
        completed_today, remaining_today, progress_ratio, execution_status = _execution_progress(
            session=session,
            today=today,
            block_id=row.block_id,
            subject_id=row.subject_id,
            planned_questions=row.planned_questions,
        )
        items.append(
            StudyPlanItem(
                discipline=row.discipline,
                strategic_discipline=normalized.strategic_discipline,
                subarea=normalized.subarea,
                block_id=row.block_id,
                block_name=block.nome if block else f"Bloco {row.block_id}",
                subject_id=row.subject_id,
                subject_name=_subject_label(subject) if subject else f"Assunto {row.subject_id}",
                planned_questions=row.planned_questions,
                completed_today=completed_today,
                remaining_today=remaining_today,
                progress_ratio=progress_ratio,
                execution_status=execution_status,
                priority_score=row.priority_score,
                primary_reason=row.primary_reason,
                planned_mode=row.planned_mode,
                roadmap_node_id=subject_state.roadmap_node_id if subject_state is not None else None,
                roadmap_mapped=subject_state.mapped if subject_state is not None else False,
                roadmap_mapping_source=subject_state.mapping_source if subject_state is not None else None,
                roadmap_mapping_confidence=subject_state.mapping_confidence if subject_state is not None else None,
                roadmap_mapping_reason=subject_state.mapping_reason if subject_state is not None else None,
                roadmap_status=(
                    subject_state.status
                    if subject_state is not None and subject_state.status is not None
                    else (roadmap_block.status if roadmap_block is not None else None)
                ),
                roadmap_reason=(
                    subject_state.reason
                    if subject_state is not None
                    else (roadmap_block.reason if roadmap_block is not None else None)
                ),
            )
        )

    return items


def _gap_weight(session: Session, subject_id: int) -> tuple[float, str]:
    attempts = session.exec(
        select(QuestionAttempt)
        .where(QuestionAttempt.subject_id == subject_id)
        .order_by(QuestionAttempt.data.desc(), QuestionAttempt.id.desc())
        .limit(20)
    ).all()
    if not attempts:
        return PERSONAL_GAP_WEIGHTS["regular"], "regular"

    accuracy = sum(1 for attempt in attempts if attempt.acertou) / len(attempts)
    if accuracy < 0.40:
        label = "critica"
    elif accuracy < 0.55:
        label = "ruim"
    elif accuracy < 0.70:
        label = "regular"
    elif accuracy < 0.85:
        label = "boa"
    else:
        label = "otima"
    return PERSONAL_GAP_WEIGHTS[label], label


def _time_without_contact_weight(today: date, progress: SubjectProgress | None) -> float:
    if progress is None:
        return 1.0
    contact_date = progress.last_seen_at or progress.unlocked_at
    if contact_date is None:
        return 1.0

    days = (today - contact_date).days
    if days >= 30:
        return 1.20
    if days >= 14:
        return 1.10
    if days >= 7:
        return 1.05
    return 1.0


def _aversion_weight(today: date, progress: SubjectProgress | None) -> float:
    if progress is None or progress.unlocked_at is None or progress.first_seen_at is not None:
        return 1.0
    days_unseen = (today - progress.unlocked_at).days
    if days_unseen >= 21:
        return 1.10
    if days_unseen >= 10:
        return 1.05
    return 1.0


def _reason(
    strategic_weight: float,
    historical_weight: float,
    gap_label: str,
    prerequisite_weight: float,
    time_weight: float,
) -> str:
    if prerequisite_weight >= 1.10 and strategic_weight >= 1.10:
        return "Pre-requisito central com alta prioridade estrategica"
    if gap_label in {"critica", "ruim"}:
        return "Lacuna pessoal importante em conteudo elegivel"
    if historical_weight >= 1.12:
        return "Conteudo recorrente no ENEM dentro da trilha atual"
    if time_weight >= 1.10:
        return "Assunto elegivel sem contato recente"
    return "Proximo passo seguro da trilha pedagogica"


def _candidate_score(
    session: Session,
    today: date,
    block: Block,
    subject: Subject,
    subject_progress: SubjectProgress | None,
) -> tuple[float, float, str]:
    subject_name = _subject_label(subject)
    topic_text = f"{subject.assunto} {subject.subassunto or ''}"
    normalized = normalize_discipline(subject.disciplina)
    strategic_weight = strategic_discipline_weight(normalized.strategic_discipline)
    historical_weight = historical_topic_weight(subject.disciplina, topic_text, subject.prioridade_enem)
    gap_weight, gap_label = _gap_weight(session, subject.id or 0)
    prerequisite_weight = prerequisite_topic_weight(topic_text)
    time_weight = _time_without_contact_weight(today, subject_progress)
    aversion_weight = _aversion_weight(today, subject_progress)

    raw_score = (
        strategic_weight
        * historical_weight
        * gap_weight
        * prerequisite_weight
        * time_weight
        * aversion_weight
    )
    priority_score = round(min(raw_score / 2.15, 0.99), 2)
    reason = _reason(strategic_weight, historical_weight, gap_label, prerequisite_weight, time_weight)
    if "redacao" in normalize_discipline_name(subject.disciplina):
        subject_name = subject_name or "Redacao"

    return raw_score, priority_score, reason


def _eligible_candidates(
    session: Session,
    today: date,
    block_progress: dict[int, BlockProgress],
    subject_progress: dict[int, SubjectProgress],
    roadmap_overview: GuidedRoadmapOverview,
) -> list[StudyPlanCandidate]:
    candidates: list[StudyPlanCandidate] = []
    seen_subjects: set[int] = set()
    blocks = session.exec(select(Block).order_by(Block.disciplina, Block.ordem, Block.id)).all()

    for block in blocks:
        if block.id is None:
            continue
        progress = block_progress.get(block.id)
        if progress is None or not block_is_focus_status(progress.status):
            continue
        roadmap_block = roadmap_overview.block_eligibility.get(block.id)
        if roadmap_block is not None and not roadmap_block.guided_eligible:
            continue

        links = session.exec(
            select(BlockSubject)
            .where(BlockSubject.block_id == block.id)
            .order_by(BlockSubject.id)
        ).all()
        for link in links:
            if link.subject_id in seen_subjects:
                continue
            subject = session.get(Subject, link.subject_id)
            if subject is None or subject.id is None or not subject.ativo:
                continue
            progress_subject = subject_progress.get(subject.id)
            if progress_subject is not None and progress_subject.status not in {"available", "in_progress"}:
                continue

            raw_score, priority_score, reason = _candidate_score(session, today, block, subject, progress_subject)
            subject_state = roadmap_overview.subject_states.get(subject.id)
            roadmap_node_id = subject_state.roadmap_node_id if subject_state is not None else None
            roadmap_mapped = subject_state.mapped if subject_state is not None else False
            roadmap_mapping_source = subject_state.mapping_source if subject_state is not None else None
            roadmap_mapping_confidence = subject_state.mapping_confidence if subject_state is not None else None
            roadmap_mapping_reason = subject_state.mapping_reason if subject_state is not None else None
            roadmap_status = roadmap_block.status if roadmap_block is not None else None
            roadmap_reason = roadmap_block.reason if roadmap_block is not None else None
            if subject_state is not None and subject_state.mapped:
                roadmap_status = subject_state.status
                roadmap_reason = subject_state.reason
                if subject_state.status in {"blocked_required", "blocked_cross_required"}:
                    continue
                raw_score *= subject_state.priority_factor
                priority_score = round(min(raw_score / 2.15, 0.99), 2)
            if roadmap_block is not None:
                raw_score *= roadmap_block.priority_factor
                priority_score = round(min(raw_score / 2.15, 0.99), 2)
                if roadmap_reason and subject_state is None:
                    reason = f"{reason}. {roadmap_reason}"
            elif roadmap_reason:
                reason = f"{reason}. {roadmap_reason}"
            if subject_state is not None and subject_state.mapped and subject_state.reason:
                reason = f"{reason}. {subject_state.reason}"
            elif subject_state is not None and not subject_state.mapped and subject_state.mapping_reason:
                reason = f"{reason}. {subject_state.mapping_reason}"
            planned_mode = block_planned_mode(progress.status)
            normalized = normalize_discipline(subject.disciplina)
            if progress.status == BLOCK_STATUS_READY_TO_ADVANCE:
                reason = f"{reason}. Bloco pronto para avancar, mas ainda em consolidacao antes da decisao"
            elif progress.status == BLOCK_STATUS_TRANSITION:
                reason = f"{reason}. Conteudo em transicao pedagogica entre o bloco atual e o proximo"
            seen_subjects.add(subject.id)
            candidates.append(
                StudyPlanCandidate(
                    discipline=subject.disciplina,
                    strategic_discipline=normalized.strategic_discipline,
                    subarea=normalized.subarea,
                    block_id=block.id,
                    block_name=block.nome,
                    block_order=block.ordem,
                    subject_id=subject.id,
                    subject_name=_subject_label(subject),
                    priority_score=priority_score,
                    raw_score=raw_score,
                    primary_reason=reason,
                    planned_mode=planned_mode,
                    roadmap_node_id=roadmap_node_id,
                    roadmap_mapped=roadmap_mapped,
                    roadmap_mapping_source=roadmap_mapping_source,
                    roadmap_mapping_confidence=roadmap_mapping_confidence,
                    roadmap_mapping_reason=roadmap_mapping_reason,
                    roadmap_status=roadmap_status,
                    roadmap_reason=roadmap_reason,
                )
            )

    return sorted(candidates, key=lambda item: (-item.raw_score, item.block_order, item.subject_id))


def _discipline_group(value: str) -> str:
    return normalize_discipline_name(normalize_discipline(value).strategic_discipline)


def _select_candidates(candidates: list[StudyPlanCandidate], focus_count: int) -> list[StudyPlanCandidate]:
    selected: list[StudyPlanCandidate] = []
    used_groups: set[str] = set()

    for candidate in candidates:
        group = _discipline_group(candidate.discipline)
        if group in used_groups:
            continue
        selected.append(candidate)
        used_groups.add(group)
        if len(selected) == focus_count:
            return selected

    for candidate in candidates:
        if candidate in selected:
            continue
        selected.append(candidate)
        if len(selected) == focus_count:
            return selected

    return selected


def _question_distribution(total_questions: int, focus_count: int) -> list[int]:
    if focus_count <= 0:
        return []
    if focus_count == 1:
        return [total_questions]
    if focus_count == 2:
        first = min(round(total_questions * 0.60), 14)
        return [first, total_questions - first]
    if focus_count > 3:
        base = max(1, total_questions // focus_count)
        counts = [base for _ in range(focus_count)]
        for index in range(total_questions - (base * focus_count)):
            counts[index] += 1
        return counts

    first = min(round(total_questions * 0.46), 14)
    second = min(round(total_questions * 0.31), 11)
    third = total_questions - first - second
    if third < 6:
        missing = 6 - third
        first = max(8, first - missing)
        third = total_questions - first - second
    return [first, second, third]


def _focus_count_for_load(total_questions: int, candidate_count: int, max_focus_count: int) -> int:
    if total_questions <= 0 or candidate_count <= 0:
        return 0
    natural_focus_count = 1
    if total_questions >= 18:
        natural_focus_count = 2
    if total_questions >= 28:
        natural_focus_count = 3
    if total_questions >= 38:
        natural_focus_count = 4
    return min(natural_focus_count, max_focus_count, candidate_count)


def _create_plan(
    session: Session,
    selected: list[StudyPlanCandidate],
    question_counts: list[int],
) -> DailyStudyPlan:
    total_questions = sum(question_counts)
    plan = DailyStudyPlan(total_planned_questions=total_questions, status="active")
    session.add(plan)
    session.flush()
    session.refresh(plan)

    for candidate, planned_questions in zip(selected, question_counts):
        session.add(
            DailyStudyPlanItem(
                plan_id=plan.id or 0,
                discipline=candidate.discipline,
                block_id=candidate.block_id,
                subject_id=candidate.subject_id,
                planned_questions=planned_questions,
                priority_score=candidate.priority_score,
                primary_reason=candidate.primary_reason,
                planned_mode=candidate.planned_mode,
            )
        )

    session.commit()
    session.refresh(plan)
    return plan


def get_today_study_plan(session: Session) -> StudyPlanTodayResponse:
    today = date.today()
    existing_plan = _latest_active_plan(session, today)
    if existing_plan is not None and existing_plan.id is not None:
        existing_items = _items_for_plan(session, existing_plan, today)
        if existing_items:
            return StudyPlanTodayResponse(
                summary=StudyPlanSummary(
                    total_questions=existing_plan.total_planned_questions,
                    focus_count=len(existing_items),
                ),
                items=existing_items,
            )

    capacity = get_or_create_capacity(session)
    if not capacity.include_new_content:
        return StudyPlanTodayResponse(
            summary=StudyPlanSummary(total_questions=0, focus_count=0),
            items=[],
        )
    block_progress, subject_progress = sync_progression(session, today)
    roadmap_overview = build_guided_roadmap_overview(session, block_progress)
    candidates = _eligible_candidates(session, today, block_progress, subject_progress, roadmap_overview)
    if not candidates:
        return StudyPlanTodayResponse(
            summary=StudyPlanSummary(total_questions=0, focus_count=0),
            items=[],
        )

    total_questions = safe_daily_question_load(capacity)
    focus_count = _focus_count_for_load(total_questions, len(candidates), capacity.max_focus_count)
    selected = _select_candidates(candidates, focus_count)
    question_counts = _question_distribution(total_questions, len(selected))
    plan = _create_plan(session, selected, question_counts)

    return StudyPlanTodayResponse(
        summary=StudyPlanSummary(total_questions=plan.total_planned_questions, focus_count=len(selected)),
        items=_items_for_plan(session, plan, today),
    )


def recalculate_today_study_plan(session: Session) -> StudyPlanRecalculateResponse:
    today = date.today()
    existing_plan = _latest_active_plan(session, today)
    replaced_plan_id = existing_plan.id if existing_plan is not None else None
    if existing_plan is not None:
        existing_plan.status = "replaced"
        session.add(existing_plan)
        session.commit()

    plan_response = get_today_study_plan(session)
    record_study_event(
        session,
        event_type="daily_plan_generated",
        title="Plano diario recalculado",
        description=(
            f"Plano diario recalculado com {plan_response.summary.total_questions} questoes "
            f"em {plan_response.summary.focus_count} focos."
        ),
        metadata={
            "recalculated": True,
            "replaced_plan_id": replaced_plan_id,
            "total_planned_questions": plan_response.summary.total_questions,
            "focus_count": plan_response.summary.focus_count,
        },
    )
    session.commit()
    return StudyPlanRecalculateResponse(
        replaced_plan_id=replaced_plan_id,
        plan=plan_response,
    )
