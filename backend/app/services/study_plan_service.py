from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

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
from app.schemas import (
    StudyPlanCalendarDay,
    StudyPlanCalendarItem,
    StudyPlanCalendarResponse,
    StudyPlanItem,
    StudyPlanRecalculateResponse,
    StudyPlanSummary,
    StudyPlanTodayResponse,
)
from app.services.capacity_service import get_or_create_capacity, safe_daily_question_load
from app.services.discipline_normalization_service import normalize_discipline
from app.services.mock_exam_service import _estimate_score_from_counts
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


@dataclass(frozen=True)
class ProjectedCarryOverItem:
    discipline: str
    block_id: int
    subject_id: int
    subject_name: str
    planned_questions: int
    reason: str


def _subject_label(subject: Subject) -> str:
    if subject.subassunto:
        return f"{subject.assunto} - {subject.subassunto}"
    return subject.assunto


def _current_plan_day() -> date:
    return datetime.utcnow().date()


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


def _active_plans_for_day(session: Session, today: date) -> list[DailyStudyPlan]:
    plans = session.exec(
        select(DailyStudyPlan)
        .where(DailyStudyPlan.status == "active")
        .order_by(DailyStudyPlan.created_at.desc())
    ).all()
    return [plan for plan in plans if plan.created_at.date() == today]


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


def _estimate_tri_for_focus(
    session: Session,
    *,
    discipline: str,
    subject_id: int,
) -> tuple[float | None, str | None]:
    subject_attempts = session.exec(
        select(QuestionAttempt)
        .where(QuestionAttempt.subject_id == subject_id)
        .order_by(QuestionAttempt.data.desc(), QuestionAttempt.id.desc())
        .limit(45)
    ).all()
    if len(subject_attempts) >= 5:
        subject_correct = sum(1 for attempt in subject_attempts if attempt.acertou)
        return _estimate_score_from_counts(discipline, subject_correct, len(subject_attempts)), "subject"

    discipline_attempts = session.exec(
        select(QuestionAttempt)
        .where(QuestionAttempt.disciplina == discipline)
        .order_by(QuestionAttempt.data.desc(), QuestionAttempt.id.desc())
        .limit(45)
    ).all()
    if len(discipline_attempts) >= 5:
        discipline_correct = sum(1 for attempt in discipline_attempts if attempt.acertou)
        return _estimate_score_from_counts(discipline, discipline_correct, len(discipline_attempts)), "discipline"

    return None, None


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
        estimated_tri_score, estimated_tri_basis = _estimate_tri_for_focus(
            session=session,
            discipline=row.discipline,
            subject_id=row.subject_id,
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
                estimated_tri_score=estimated_tri_score,
                estimated_tri_basis=estimated_tri_basis,
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


def _response_from_items(items: list[StudyPlanItem]) -> StudyPlanTodayResponse:
    return StudyPlanTodayResponse(
        summary=StudyPlanSummary(
            total_questions=sum(item.planned_questions for item in items),
            focus_count=len(items),
        ),
        items=items,
    )


def _empty_plan_response() -> StudyPlanTodayResponse:
    return _response_from_items([])


def _recent_subject_accuracy(
    session: Session,
    *,
    subject_id: int,
    limit: int = 12,
) -> tuple[int, int, float | None]:
    attempts = session.exec(
        select(QuestionAttempt)
        .where(QuestionAttempt.subject_id == subject_id)
        .order_by(QuestionAttempt.data.desc(), QuestionAttempt.id.desc())
        .limit(limit)
    ).all()
    if not attempts:
        return 0, 0, None
    correct = sum(1 for attempt in attempts if attempt.acertou)
    return len(attempts), correct, correct / len(attempts)


def _carry_over_projection_items(
    session: Session,
    today_items: list[StudyPlanItem],
) -> list[ProjectedCarryOverItem]:
    projected: list[ProjectedCarryOverItem] = []

    for item in today_items:
        remaining_questions = max(item.remaining_today, 0)
        attempts_count, _, accuracy = _recent_subject_accuracy(session, subject_id=item.subject_id)

        if remaining_questions > 0:
            reason = "Pendencia de hoje carregada automaticamente para o proximo dia."
            if attempts_count >= 4 and accuracy is not None and accuracy < 0.5:
                reason = f"{reason} Desempenho recente pede reforco antes do avancar."
            projected.append(
                ProjectedCarryOverItem(
                    discipline=item.discipline,
                    block_id=item.block_id,
                    subject_id=item.subject_id,
                    subject_name=item.subject_name,
                    planned_questions=remaining_questions,
                    reason=reason,
                )
            )
            continue

        if item.completed_today > 0 and attempts_count >= 4 and accuracy is not None and accuracy < 0.5:
            reinforcement_questions = min(max(4, round(item.planned_questions * 0.45)), 8)
            projected.append(
                ProjectedCarryOverItem(
                    discipline=item.discipline,
                    block_id=item.block_id,
                    subject_id=item.subject_id,
                    subject_name=item.subject_name,
                    planned_questions=reinforcement_questions,
                    reason="Reforco mantido por desempenho recente abaixo do esperado.",
                )
            )

    unique_items: list[ProjectedCarryOverItem] = []
    seen_subject_ids: set[int] = set()
    for item in projected:
        if item.subject_id in seen_subject_ids:
            continue
        seen_subject_ids.add(item.subject_id)
        unique_items.append(item)
    return unique_items


def _calendar_item_from_study_plan_item(item: StudyPlanItem) -> StudyPlanCalendarItem:
    return StudyPlanCalendarItem(
        type="study_focus",
        discipline=item.discipline,
        block_id=item.block_id,
        subject_id=item.subject_id,
        subject_name=item.subject_name,
        planned_questions=item.planned_questions,
        reason=item.primary_reason,
    )


def _build_projected_day(
    session: Session,
    *,
    projection_date: date,
    capacity,
    candidates: list[StudyPlanCandidate],
    carry_over_items: list[ProjectedCarryOverItem],
) -> StudyPlanCalendarDay:
    total_limit = safe_daily_question_load(capacity)
    focus_limit = capacity.max_focus_count
    selected_items: list[StudyPlanCalendarItem] = []
    used_subject_ids: set[int] = set()
    remaining_questions = total_limit

    for item in carry_over_items:
        if len(selected_items) >= focus_limit or remaining_questions <= 0:
            break
        planned_questions = min(item.planned_questions, remaining_questions)
        if planned_questions <= 0:
            continue
        selected_items.append(
            StudyPlanCalendarItem(
                type="study_focus",
                discipline=item.discipline,
                block_id=item.block_id,
                subject_id=item.subject_id,
                subject_name=item.subject_name,
                planned_questions=planned_questions,
                reason=item.reason,
            )
        )
        used_subject_ids.add(item.subject_id)
        remaining_questions -= planned_questions

    available_candidates = [
        candidate for candidate in candidates if candidate.subject_id not in used_subject_ids
    ]
    remaining_slots = max(focus_limit - len(selected_items), 0)
    projected_candidates = _select_candidates(available_candidates, remaining_slots)
    question_counts = _question_distribution(max(remaining_questions, 0), len(projected_candidates))

    for candidate, planned_questions in zip(projected_candidates, question_counts):
        if planned_questions <= 0:
            continue
        selected_items.append(
            StudyPlanCalendarItem(
                type="study_focus",
                discipline=candidate.discipline,
                block_id=candidate.block_id,
                subject_id=candidate.subject_id,
                subject_name=candidate.subject_name,
                planned_questions=planned_questions,
                reason=candidate.primary_reason,
            )
        )

    if not selected_items:
        return StudyPlanCalendarDay(
            date=projection_date.isoformat(),
            status="projected",
            total_questions=0,
            focus_count=0,
            items=[
                StudyPlanCalendarItem(
                    type="rest",
                    planned_questions=0,
                    reason="Sem candidatos uteis no estado atual. O dia fica leve ate surgir nova necessidade.",
                )
            ],
            reason="Previsao baseada no estado atual, sem carga obrigatoria para este dia.",
        )

    day_status = "adjusted" if carry_over_items else "projected"
    day_reason = (
        "Previsao ajustada por pendencia ou reforco do dia anterior."
        if carry_over_items
        else "Previsao baseada no estado atual."
    )
    total_questions = sum(item.planned_questions for item in selected_items)
    return StudyPlanCalendarDay(
        date=projection_date.isoformat(),
        status=day_status,
        total_questions=total_questions,
        focus_count=len(selected_items),
        items=selected_items,
        reason=day_reason,
    )


def build_study_plan_calendar(
    session: Session,
    *,
    start_day: date,
    days: int,
) -> StudyPlanCalendarResponse:
    normalized_days = max(1, min(days, 14))
    current_plan_day = _current_plan_day()
    today_plan = get_today_study_plan(session) if start_day == current_plan_day else _empty_plan_response()
    if start_day != current_plan_day:
        existing_plan = _latest_active_plan(session, start_day)
        if existing_plan is not None and existing_plan.id is not None:
            today_plan = _response_from_items(_items_for_plan(session, existing_plan, start_day))
        else:
            capacity = get_or_create_capacity(session)
            if capacity.include_new_content:
                block_progress, subject_progress = sync_progression(session, start_day)
                roadmap_overview = build_guided_roadmap_overview(session, block_progress)
                candidates = _eligible_candidates(session, start_day, block_progress, subject_progress, roadmap_overview)
                total_questions = safe_daily_question_load(capacity)
                focus_count = _focus_count_for_load(total_questions, len(candidates), capacity.max_focus_count)
                selected = _select_candidates(candidates, focus_count)
                question_counts = _question_distribution(total_questions, len(selected))
                today_plan = _response_from_items(
                    [
                        StudyPlanItem(
                            discipline=candidate.discipline,
                            strategic_discipline=candidate.strategic_discipline,
                            subarea=candidate.subarea,
                            block_id=candidate.block_id,
                            block_name=candidate.block_name,
                            subject_id=candidate.subject_id,
                            subject_name=candidate.subject_name,
                            planned_questions=planned_questions,
                            completed_today=0,
                            remaining_today=planned_questions,
                            progress_ratio=0,
                            execution_status="nao_iniciado",
                            priority_score=candidate.priority_score,
                            primary_reason=candidate.primary_reason,
                            planned_mode=candidate.planned_mode,
                            roadmap_node_id=candidate.roadmap_node_id,
                            roadmap_mapped=candidate.roadmap_mapped,
                            roadmap_mapping_source=candidate.roadmap_mapping_source,
                            roadmap_mapping_confidence=candidate.roadmap_mapping_confidence,
                            roadmap_mapping_reason=candidate.roadmap_mapping_reason,
                            roadmap_status=candidate.roadmap_status,
                            roadmap_reason=candidate.roadmap_reason,
                        )
                        for candidate, planned_questions in zip(selected, question_counts)
                    ]
                )

    capacity = get_or_create_capacity(session)
    block_progress, subject_progress = sync_progression(session, start_day)
    roadmap_overview = build_guided_roadmap_overview(session, block_progress)
    candidates = _eligible_candidates(session, start_day, block_progress, subject_progress, roadmap_overview)
    carry_over_items = _carry_over_projection_items(session, today_plan.items)

    days_payload: list[StudyPlanCalendarDay] = [
        StudyPlanCalendarDay(
            date=start_day.isoformat(),
            status="today",
            total_questions=today_plan.summary.total_questions,
            focus_count=today_plan.summary.focus_count,
            items=[_calendar_item_from_study_plan_item(item) for item in today_plan.items],
            reason="Plano ativo de hoje.",
        )
    ]

    for offset in range(1, normalized_days):
        projection_date = start_day + timedelta(days=offset)
        future_day = _build_projected_day(
            session,
            projection_date=projection_date,
            capacity=capacity,
            candidates=candidates,
            carry_over_items=carry_over_items if offset == 1 else [],
        )
        days_payload.append(future_day)

    return StudyPlanCalendarResponse(
        start_date=start_day.isoformat(),
        end_date=(start_day + timedelta(days=normalized_days - 1)).isoformat(),
        days=days_payload,
    )


def get_study_plan_calendar(session: Session, days: int = 7) -> StudyPlanCalendarResponse:
    return build_study_plan_calendar(session, start_day=_current_plan_day(), days=days)


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
    if focus_count <= 0:
        return []

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
    today = _current_plan_day()
    existing_plan = _latest_active_plan(session, today)
    if existing_plan is not None and existing_plan.id is not None:
        existing_items = _items_for_plan(session, existing_plan, today)
        if existing_items:
            return _response_from_items(existing_items)
        existing_plan.status = "replaced"
        session.add(existing_plan)
        session.commit()

    capacity = get_or_create_capacity(session)
    if not capacity.include_new_content:
        return _empty_plan_response()
    block_progress, subject_progress = sync_progression(session, today)
    roadmap_overview = build_guided_roadmap_overview(session, block_progress)
    candidates = _eligible_candidates(session, today, block_progress, subject_progress, roadmap_overview)
    if not candidates:
        return _empty_plan_response()

    total_questions = safe_daily_question_load(capacity)
    focus_count = _focus_count_for_load(total_questions, len(candidates), capacity.max_focus_count)
    selected = _select_candidates(candidates, focus_count)
    question_counts = _question_distribution(total_questions, len(selected))
    plan = _create_plan(session, selected, question_counts)

    return _response_from_items(_items_for_plan(session, plan, today))


def recalculate_today_study_plan(session: Session) -> StudyPlanRecalculateResponse:
    today = _current_plan_day()
    active_plans = _active_plans_for_day(session, today)
    replaced_plan_id = active_plans[0].id if active_plans else None
    if active_plans:
        for plan in active_plans:
            plan.status = "replaced"
            session.add(plan)
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
            "total_questions": plan_response.summary.total_questions,
            "total_planned_questions": plan_response.summary.total_questions,
            "focus_count": plan_response.summary.focus_count,
        },
    )
    session.commit()
    return StudyPlanRecalculateResponse(
        replaced_plan_id=replaced_plan_id,
        plan=plan_response,
    )
