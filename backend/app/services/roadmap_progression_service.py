from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from sqlmodel import Session, select

from app.core.rules import (
    BLOCK_STATUS_READY_TO_ADVANCE,
    BLOCK_STATUS_REVIEWABLE,
    BLOCK_STATUS_TRANSITION,
    block_is_focus_status,
)
from app.models import Block, BlockProgress, QuestionAttempt, RoadmapBlockMap, RoadmapEdge, RoadmapNode
from app.services.roadmap_subject_mapping_service import build_subject_roadmap_mapping
from app.services.roadmap_query_service import normalize_discipline


RoadmapNodeStatus = Literal[
    "entry",
    "available",
    "blocked_required",
    "blocked_cross_required",
    "reviewable",
]


@dataclass(frozen=True)
class GuidedRoadmapNodeState:
    node_id: str
    discipline: str
    status: RoadmapNodeStatus
    unmet_recommended_count: int
    unmet_cross_support_count: int


@dataclass(frozen=True)
class GuidedRoadmapBlockEligibility:
    block_id: int
    discipline: str
    block_number: int
    status: str
    guided_eligible: bool
    priority_factor: float
    reason: str
    entry_count: int
    available_count: int
    blocked_required_count: int
    blocked_cross_required_count: int
    reviewable_count: int
    mapped_node_ids: tuple[str, ...]


@dataclass(frozen=True)
class GuidedRoadmapDisciplineSummary:
    discipline: str
    entry_nodes: tuple[str, ...]
    available_nodes: tuple[str, ...]
    blocked_required_nodes: tuple[str, ...]
    blocked_cross_required_nodes: tuple[str, ...]
    reviewable_nodes: tuple[str, ...]


@dataclass(frozen=True)
class GuidedRoadmapOverview:
    node_states: dict[str, GuidedRoadmapNodeState]
    block_eligibility: dict[int, GuidedRoadmapBlockEligibility]
    discipline_summaries: dict[str, GuidedRoadmapDisciplineSummary]
    subject_states: dict[int, "GuidedRoadmapSubjectState"]


@dataclass(frozen=True)
class GuidedRoadmapSubjectState:
    subject_id: int
    mapped: bool
    roadmap_node_id: str | None
    mapping_source: str
    mapping_confidence: float
    mapping_reason: str
    relevant_candidate_count: int
    status: RoadmapNodeStatus | None
    reason: str
    expected_contacts_min: int | None
    attempts_count: int
    recent_accuracy: float | None
    priority_factor: float


HARD_RELATION_TYPES = {"required", "cross_required"}
SOFT_RELATION_TYPES = {"recommended", "cross_support"}


def _load_roadmap_nodes(session: Session) -> dict[str, RoadmapNode]:
    nodes = session.exec(select(RoadmapNode).where(RoadmapNode.ativo == True)).all()  # noqa: E712
    return {node.node_id: node for node in nodes}


def _load_incoming_edges(session: Session) -> dict[str, list[RoadmapEdge]]:
    incoming: dict[str, list[RoadmapEdge]] = {}
    for edge in session.exec(select(RoadmapEdge)).all():
        incoming.setdefault(edge.to_node_id, []).append(edge)
    return incoming


def _discipline_block_sets(
    session: Session,
    block_progress_by_id: dict[int, BlockProgress],
) -> tuple[dict[str, set[int]], dict[str, set[int]], dict[int, tuple[str, int]]]:
    focus_by_discipline: dict[str, set[int]] = {}
    reviewable_by_discipline: dict[str, set[int]] = {}
    block_lookup: dict[int, tuple[str, int]] = {}

    blocks = session.exec(select(Block)).all()
    for block in blocks:
        if block.id is None:
            continue
        normalized = normalize_discipline(block.disciplina)
        block_lookup[block.id] = (normalized, block.ordem)
        progress = block_progress_by_id.get(block.id)
        if progress is None:
            continue
        if block_is_focus_status(progress.status):
            focus_by_discipline.setdefault(normalized, set()).add(block.ordem)
        elif progress.status == BLOCK_STATUS_REVIEWABLE:
            reviewable_by_discipline.setdefault(normalized, set()).add(block.ordem)

    return focus_by_discipline, reviewable_by_discipline, block_lookup


def _mapped_node_sets(
    session: Session,
    focus_by_discipline: dict[str, set[int]],
    reviewable_by_discipline: dict[str, set[int]],
) -> tuple[dict[str, set[int]], set[str], set[str]]:
    block_numbers_by_node: dict[str, set[int]] = {}
    disciplines_by_node: dict[str, str] = {}
    active_node_ids: set[str] = set()
    reviewable_node_ids: set[str] = set()

    for item in session.exec(select(RoadmapBlockMap)).all():
        normalized = normalize_discipline(item.disciplina)
        disciplines_by_node[item.node_id] = normalized
        block_numbers_by_node.setdefault(item.node_id, set()).add(item.block_number)
        if item.block_number in focus_by_discipline.get(normalized, set()):
            active_node_ids.add(item.node_id)
        elif item.block_number in reviewable_by_discipline.get(normalized, set()):
            reviewable_node_ids.add(item.node_id)

    reviewable_node_ids -= active_node_ids
    return block_numbers_by_node, active_node_ids, reviewable_node_ids


def _classify_active_nodes(
    active_node_ids: set[str],
    reviewable_node_ids: set[str],
    incoming_edges: dict[str, list[RoadmapEdge]],
) -> dict[str, GuidedRoadmapNodeState]:
    states: dict[str, GuidedRoadmapNodeState] = {}
    satisfied = set(reviewable_node_ids)
    unresolved = set(active_node_ids)

    while unresolved:
        progressed = False
        for node_id in list(unresolved):
            hard_edges = [edge for edge in incoming_edges.get(node_id, []) if edge.relation_type in HARD_RELATION_TYPES]
            if not hard_edges:
                states[node_id] = GuidedRoadmapNodeState(
                    node_id=node_id,
                    discipline="",
                    status="entry",
                    unmet_recommended_count=0,
                    unmet_cross_support_count=0,
                )
                unresolved.remove(node_id)
                satisfied.add(node_id)
                progressed = True
                continue

            pending_dependency = False
            blocked_required = False
            blocked_cross_required = False
            for edge in hard_edges:
                dependency_id = edge.from_node_id
                if dependency_id in satisfied:
                    continue
                if dependency_id in unresolved:
                    pending_dependency = True
                    continue
                if edge.relation_type == "cross_required":
                    blocked_cross_required = True
                else:
                    blocked_required = True

            if blocked_cross_required or blocked_required:
                states[node_id] = GuidedRoadmapNodeState(
                    node_id=node_id,
                    discipline="",
                    status="blocked_cross_required" if blocked_cross_required else "blocked_required",
                    unmet_recommended_count=0,
                    unmet_cross_support_count=0,
                )
                unresolved.remove(node_id)
                progressed = True
                continue

            if not pending_dependency:
                states[node_id] = GuidedRoadmapNodeState(
                    node_id=node_id,
                    discipline="",
                    status="available",
                    unmet_recommended_count=0,
                    unmet_cross_support_count=0,
                )
                unresolved.remove(node_id)
                satisfied.add(node_id)
                progressed = True

        if progressed:
            continue

        for node_id in list(unresolved):
            hard_edges = [edge for edge in incoming_edges.get(node_id, []) if edge.relation_type in HARD_RELATION_TYPES]
            has_cross = any(edge.relation_type == "cross_required" for edge in hard_edges)
            states[node_id] = GuidedRoadmapNodeState(
                node_id=node_id,
                discipline="",
                status="blocked_cross_required" if has_cross else "blocked_required",
                unmet_recommended_count=0,
                unmet_cross_support_count=0,
            )
            unresolved.remove(node_id)

    final_satisfied = {
        node_id
        for node_id, state in states.items()
        if state.status in {"entry", "available"}
    } | reviewable_node_ids
    for node_id, state in list(states.items()):
        soft_edges = [edge for edge in incoming_edges.get(node_id, []) if edge.relation_type in SOFT_RELATION_TYPES]
        unmet_recommended = sum(
            1
            for edge in soft_edges
            if edge.relation_type == "recommended" and edge.from_node_id not in final_satisfied
        )
        unmet_cross_support = sum(
            1
            for edge in soft_edges
            if edge.relation_type == "cross_support" and edge.from_node_id not in final_satisfied
        )
        states[node_id] = GuidedRoadmapNodeState(
            node_id=node_id,
            discipline=state.discipline,
            status=state.status,
            unmet_recommended_count=unmet_recommended,
            unmet_cross_support_count=unmet_cross_support,
        )

    return states


def _build_block_eligibility(
    session: Session,
    node_states: dict[str, GuidedRoadmapNodeState],
    reviewable_node_ids: set[str],
    block_progress_by_id: dict[int, BlockProgress],
    block_lookup: dict[int, tuple[str, int]],
) -> dict[int, GuidedRoadmapBlockEligibility]:
    by_block_key: dict[tuple[str, int], list[str]] = {}
    for item in session.exec(select(RoadmapBlockMap)).all():
        by_block_key.setdefault((normalize_discipline(item.disciplina), item.block_number), []).append(item.node_id)

    eligibility: dict[int, GuidedRoadmapBlockEligibility] = {}
    for block_id, (discipline, block_number) in block_lookup.items():
        progress = block_progress_by_id.get(block_id)
        if progress is None or not block_is_focus_status(progress.status):
            continue

        mapped_node_ids = sorted(set(by_block_key.get((discipline, block_number), [])))
        if not mapped_node_ids:
            eligibility[block_id] = GuidedRoadmapBlockEligibility(
                block_id=block_id,
                discipline=discipline,
                block_number=block_number,
                status="available",
                guided_eligible=True,
                priority_factor=1.0,
                reason="Bloco sem mapeamento explicito no roadmap; mantido por compatibilidade nesta v1.",
                entry_count=0,
                available_count=0,
                blocked_required_count=0,
                blocked_cross_required_count=0,
                reviewable_count=0,
                mapped_node_ids=tuple(),
            )
            continue

        entry_count = 0
        available_count = 0
        blocked_required_count = 0
        blocked_cross_required_count = 0
        reviewable_count = 0
        soft_penalty = 0.0
        for node_id in mapped_node_ids:
            state = node_states.get(node_id)
            if state is None and node_id in reviewable_node_ids:
                reviewable_count += 1
                continue
            if state is None:
                continue
            if state.status == "entry":
                entry_count += 1
                soft_penalty += state.unmet_recommended_count * 0.02 + state.unmet_cross_support_count * 0.01
            elif state.status == "available":
                available_count += 1
                soft_penalty += state.unmet_recommended_count * 0.02 + state.unmet_cross_support_count * 0.01
            elif state.status == "blocked_required":
                blocked_required_count += 1
            elif state.status == "blocked_cross_required":
                blocked_cross_required_count += 1

        guided_eligible = entry_count + available_count > 0
        if entry_count > 0:
            status = "entry"
            reason = "Roadmap liberou node de entrada no bloco operacional atual."
        elif available_count > 0:
            status = "available"
            reason = "Roadmap liberou node com prerequisitos obrigatorios satisfeitos."
        elif blocked_cross_required_count > 0:
            status = "blocked_cross_required"
            reason = "Roadmap bloqueia este bloco por dependencia cruzada obrigatoria ainda nao satisfeita."
        elif blocked_required_count > 0:
            status = "blocked_required"
            reason = "Roadmap bloqueia este bloco por dependencia obrigatoria ainda nao satisfeita."
        else:
            status = "reviewable"
            reason = "Roadmap nao liberou novo foco; os nodes mapeados estao em revisao."

        base_factor = 1.05 if entry_count > 0 else 1.0
        priority_factor = max(0.85, round(base_factor - min(soft_penalty, 0.18), 2))
        if not guided_eligible:
            priority_factor = 0.0

        eligibility[block_id] = GuidedRoadmapBlockEligibility(
            block_id=block_id,
            discipline=discipline,
            block_number=block_number,
            status=status,
            guided_eligible=guided_eligible,
            priority_factor=priority_factor,
            reason=reason,
            entry_count=entry_count,
            available_count=available_count,
            blocked_required_count=blocked_required_count,
            blocked_cross_required_count=blocked_cross_required_count,
            reviewable_count=reviewable_count,
            mapped_node_ids=tuple(mapped_node_ids),
        )

    return eligibility


def _discipline_summaries(
    nodes: dict[str, RoadmapNode],
    node_states: dict[str, GuidedRoadmapNodeState],
    reviewable_node_ids: set[str],
) -> dict[str, GuidedRoadmapDisciplineSummary]:
    grouped: dict[str, dict[str, list[str]]] = {}

    for node_id, node in nodes.items():
        discipline = normalize_discipline(node.disciplina)
        bucket = grouped.setdefault(
            discipline,
            {
                "entry": [],
                "available": [],
                "blocked_required": [],
                "blocked_cross_required": [],
                "reviewable": [],
            },
        )
        state = node_states.get(node_id)
        if state is not None:
            bucket[state.status].append(node_id)
        elif node_id in reviewable_node_ids:
            bucket["reviewable"].append(node_id)

    return {
        discipline: GuidedRoadmapDisciplineSummary(
            discipline=discipline,
            entry_nodes=tuple(sorted(values["entry"])),
            available_nodes=tuple(sorted(values["available"])),
            blocked_required_nodes=tuple(sorted(values["blocked_required"])),
            blocked_cross_required_nodes=tuple(sorted(values["blocked_cross_required"])),
            reviewable_nodes=tuple(sorted(values["reviewable"])),
        )
        for discipline, values in grouped.items()
    }


def _attempts_by_subject(session: Session) -> dict[int, list[QuestionAttempt]]:
    attempts = session.exec(
        select(QuestionAttempt)
        .where(QuestionAttempt.subject_id.is_not(None))
        .order_by(QuestionAttempt.data.desc(), QuestionAttempt.id.desc())
    ).all()
    grouped: dict[int, list[QuestionAttempt]] = {}
    for attempt in attempts:
        if attempt.subject_id is None:
            continue
        grouped.setdefault(attempt.subject_id, []).append(attempt)
    return grouped


def _contact_heuristic(
    attempts_count: int,
    recent_accuracy: float | None,
    expected_contacts_min: int | None,
) -> tuple[float, str]:
    if expected_contacts_min is None or expected_contacts_min <= 0:
        return 1.0, "Node sem meta minima explicita de contatos."
    if attempts_count == 0:
        return 1.03, "Primeiro contato guiado com node liberado pelo roadmap."
    if attempts_count >= expected_contacts_min:
        if recent_accuracy is not None and recent_accuracy < 0.55:
            return 1.06, "Contatos minimos atingidos, mas desempenho recente ainda pede reforco."
        return 1.0, "Contatos minimos do node ja alcancados."
    if recent_accuracy is not None and recent_accuracy >= 0.85 and attempts_count >= 2:
        return 1.02, "Desempenho recente forte flexibilizou os contatos minimos esperados."
    if recent_accuracy is not None and recent_accuracy < 0.55:
        return 1.1, "Abaixo dos contatos minimos e com desempenho fraco; node segue em consolidacao guiada."
    return 1.05, "Abaixo dos contatos minimos esperados; node segue em consolidacao guiada."


def _build_subject_states(
    session: Session,
    nodes: dict[str, RoadmapNode],
    node_states: dict[str, GuidedRoadmapNodeState],
    reviewable_node_ids: set[str],
) -> dict[int, GuidedRoadmapSubjectState]:
    mapping_by_subject = build_subject_roadmap_mapping(session)
    attempts_by_subject = _attempts_by_subject(session)
    states: dict[int, GuidedRoadmapSubjectState] = {}

    for subject_id, mapping in mapping_by_subject.items():
        attempts = attempts_by_subject.get(subject_id, [])
        attempts_count = len(attempts)
        recent_attempts = attempts[:8]
        recent_accuracy = None
        if recent_attempts:
            recent_accuracy = sum(1 for attempt in recent_attempts if attempt.acertou) / len(recent_attempts)

        if not mapping.mapped or mapping.roadmap_node_id is None:
            states[subject_id] = GuidedRoadmapSubjectState(
                subject_id=subject_id,
                mapped=False,
                roadmap_node_id=None,
                mapping_source=mapping.mapping_source,
                mapping_confidence=mapping.confidence_score,
                mapping_reason=mapping.reason,
                relevant_candidate_count=mapping.relevant_candidate_count,
                status=None,
                reason="Subject sem node mapeado com confianca; mantido por fallback operacional do bloco.",
                expected_contacts_min=None,
                attempts_count=attempts_count,
                recent_accuracy=recent_accuracy,
                priority_factor=1.0,
            )
            continue

        node = nodes.get(mapping.roadmap_node_id)
        base_status: RoadmapNodeStatus | None = None
        base_reason = mapping.reason
        if mapping.roadmap_node_id in reviewable_node_ids:
            base_status = "reviewable"
            base_reason = "Node mapeado esta em faixa reviewable na trilha atual."
        else:
            state = node_states.get(mapping.roadmap_node_id)
            if state is not None:
                base_status = state.status
                if state.status == "entry":
                    base_reason = "Node mapeado entrou como ponto de entrada no roadmap."
                elif state.status == "available":
                    base_reason = "Node mapeado esta liberado com prerequisitos obrigatorios satisfeitos."
                elif state.status == "blocked_required":
                    base_reason = "Node mapeado ainda esta bloqueado por dependencia obrigatoria."
                elif state.status == "blocked_cross_required":
                    base_reason = "Node mapeado ainda esta bloqueado por dependencia cruzada obrigatoria."

        priority_factor = 1.0
        if base_status in {"entry", "available", "reviewable"}:
            priority_factor, heuristic_reason = _contact_heuristic(
                attempts_count=attempts_count,
                recent_accuracy=recent_accuracy,
                expected_contacts_min=node.expected_contacts_min if node is not None else None,
            )
            base_reason = f"{base_reason} {heuristic_reason}".strip()

        states[subject_id] = GuidedRoadmapSubjectState(
            subject_id=subject_id,
            mapped=True,
            roadmap_node_id=mapping.roadmap_node_id,
            mapping_source=mapping.mapping_source,
            mapping_confidence=mapping.confidence_score,
            mapping_reason=mapping.reason,
            relevant_candidate_count=mapping.relevant_candidate_count,
            status=base_status,
            reason=base_reason,
            expected_contacts_min=node.expected_contacts_min if node is not None else None,
            attempts_count=attempts_count,
            recent_accuracy=recent_accuracy,
            priority_factor=priority_factor,
        )

    return states


def build_guided_roadmap_overview(
    session: Session,
    block_progress_by_id: dict[int, BlockProgress],
) -> GuidedRoadmapOverview:
    nodes = _load_roadmap_nodes(session)
    incoming_edges = _load_incoming_edges(session)
    focus_by_discipline, reviewable_by_discipline, block_lookup = _discipline_block_sets(session, block_progress_by_id)
    _, active_node_ids, reviewable_node_ids = _mapped_node_sets(
        session,
        focus_by_discipline,
        reviewable_by_discipline,
    )

    node_states = _classify_active_nodes(active_node_ids, reviewable_node_ids, incoming_edges)
    eligibility = _build_block_eligibility(
        session=session,
        node_states=node_states,
        reviewable_node_ids=reviewable_node_ids,
        block_progress_by_id=block_progress_by_id,
        block_lookup=block_lookup,
    )
    summaries = _discipline_summaries(nodes, node_states, reviewable_node_ids)
    subject_states = _build_subject_states(session, nodes, node_states, reviewable_node_ids)

    return GuidedRoadmapOverview(
        node_states=node_states,
        block_eligibility=eligibility,
        discipline_summaries=summaries,
        subject_states=subject_states,
    )


def get_discipline_guided_roadmap_summary(
    session: Session,
    discipline: str,
    block_progress_by_id: dict[int, BlockProgress] | None = None,
) -> GuidedRoadmapDisciplineSummary:
    if block_progress_by_id is None:
        from app.services.progression_service import sync_progression

        block_progress_by_id, _ = sync_progression(session, date.today())

    overview = build_guided_roadmap_overview(session, block_progress_by_id)
    normalized = normalize_discipline(discipline)
    return overview.discipline_summaries.get(
        normalized,
        GuidedRoadmapDisciplineSummary(
            discipline=normalized,
            entry_nodes=tuple(),
            available_nodes=tuple(),
            blocked_required_nodes=tuple(),
            blocked_cross_required_nodes=tuple(),
            reviewable_nodes=tuple(),
        ),
    )
