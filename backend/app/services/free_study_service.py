from __future__ import annotations

from dataclasses import dataclass

from sqlmodel import Session, select

from app.core.rules import (
    BLOCK_STATUS_REVIEWABLE,
)
from app.models import Block, BlockProgress, BlockSubject, RoadmapBlockMap, RoadmapEdge, RoadmapNode, Subject
from app.schemas import (
    FreeStudyCatalogDiscipline,
    FreeStudyCatalogResponse,
    FreeStudyCatalogSubarea,
    FreeStudyRoadmapNodeBrief,
    FreeStudySubjectCatalogItem,
    FreeStudySubjectContextResponse,
)
from app.services.discipline_normalization_service import normalize_discipline
from app.services.roadmap_progression_service import build_guided_roadmap_overview
from app.services.roadmap_subject_mapping_service import build_subject_roadmap_mapping


@dataclass(frozen=True)
class _SubjectBlock:
    block_id: int | None
    block_name: str | None


def _subject_label(subject: Subject) -> str:
    if subject.subassunto:
        return f"{subject.assunto} - {subject.subassunto}"
    return subject.assunto


def _block_progress_by_id(session: Session) -> dict[int, BlockProgress]:
    return {
        progress.block_id: progress
        for progress in session.exec(select(BlockProgress)).all()
    }


def _primary_blocks_by_subject(session: Session) -> dict[int, _SubjectBlock]:
    links = session.exec(
        select(BlockSubject, Block)
        .join(Block, Block.id == BlockSubject.block_id)
        .order_by(Block.ordem, Block.id)
    ).all()
    result: dict[int, _SubjectBlock] = {}
    for link, block in links:
        if link.subject_id in result:
            continue
        result[link.subject_id] = _SubjectBlock(
            block_id=block.id,
            block_name=block.nome,
        )
    return result


def _nodes_by_id(session: Session) -> dict[str, RoadmapNode]:
    nodes = session.exec(select(RoadmapNode).where(RoadmapNode.ativo == True)).all()  # noqa: E712
    return {node.node_id: node for node in nodes}


def _incoming_edges_by_target(session: Session) -> dict[str, list[RoadmapEdge]]:
    edges = session.exec(select(RoadmapEdge)).all()
    incoming: dict[str, list[RoadmapEdge]] = {}
    for edge in edges:
        incoming.setdefault(edge.to_node_id, []).append(edge)
    return incoming


def _satisfied_node_ids(session: Session, block_progress_by_id: dict[int, BlockProgress]) -> set[str]:
    satisfied: set[str] = set()
    blocks = session.exec(select(Block)).all()
    satisfied_block_keys = {
        (block.disciplina, block.ordem)
        for block in blocks
        if block.id is not None
        and block.id in block_progress_by_id
        and (
            block_progress_by_id[block.id].status == BLOCK_STATUS_REVIEWABLE
            or block_progress_by_id[block.id].approved_at is not None
        )
    }
    if not satisfied_block_keys:
        return satisfied

    for item in session.exec(select(RoadmapBlockMap)).all():
        if (item.disciplina, item.block_number) in satisfied_block_keys:
            satisfied.add(item.node_id)
    return satisfied


def _node_brief(
    node: RoadmapNode,
    edge: RoadmapEdge | None = None,
) -> FreeStudyRoadmapNodeBrief:
    return FreeStudyRoadmapNodeBrief(
        node_id=node.node_id,
        discipline=node.disciplina,
        subject_area=node.materia,
        content=node.conteudo,
        subunit=node.subunidade,
        relation_type=edge.relation_type if edge is not None else None,  # type: ignore[arg-type]
        strength=edge.strength if edge is not None else None,
        notes=edge.notes if edge is not None else None,
    )


def _warning(
    *,
    roadmap_mapped: bool,
    guided_status: str | None,
    missing_required_count: int = 0,
    missing_cross_required_count: int = 0,
    missing_soft_count: int = 0,
) -> tuple[str, str | None]:
    if not roadmap_mapped:
        return (
            "low",
            "Este conteudo pode ser estudado no modo livre, mas ainda nao possui mapeamento confiavel no roadmap.",
        )
    if missing_required_count > 0 or guided_status == "blocked_required":
        return (
            "high",
            "Este conteudo pode ser estudado no modo livre, mas ainda possui pre-requisitos obrigatorios pendentes no roadmap.",
        )
    if missing_cross_required_count > 0 or guided_status == "blocked_cross_required":
        return (
            "high",
            "Este conteudo pode ser estudado no modo livre, mas depende de conteudos obrigatorios de outra area ainda pendentes.",
        )
    if missing_soft_count > 0:
        return (
            "medium",
            "Este conteudo esta liberado no modo livre, mas ha apoios recomendados ainda pendentes.",
        )
    if guided_status in {"entry", "available", "reviewable"}:
        return "none", None
    return (
        "low",
        "Este conteudo pode ser estudado no modo livre, mas nao ha status guiado claro para ele neste momento.",
    )


def _derive_guided_status(
    *,
    roadmap_mapped: bool,
    current_status: str | None,
    direct_count: int,
    missing_required_count: int,
    missing_cross_required_count: int,
) -> str | None:
    if not roadmap_mapped:
        return None
    if current_status is not None:
        return current_status
    if missing_cross_required_count > 0:
        return "blocked_cross_required"
    if missing_required_count > 0:
        return "blocked_required"
    if direct_count == 0:
        return "entry"
    return "available"


def _context_parts(
    session: Session,
    subject: Subject,
) -> tuple[
    str | None,
    bool,
    str | None,
    list[FreeStudyRoadmapNodeBrief],
    list[FreeStudyRoadmapNodeBrief],
    list[FreeStudyRoadmapNodeBrief],
    list[FreeStudyRoadmapNodeBrief],
]:
    block_progress_by_id = _block_progress_by_id(session)
    overview = build_guided_roadmap_overview(session, block_progress_by_id)
    state = overview.subject_states.get(subject.id or 0)
    mapping = build_subject_roadmap_mapping(session).get(subject.id or 0)
    roadmap_node_id = state.roadmap_node_id if state is not None else mapping.roadmap_node_id if mapping else None
    roadmap_mapped = bool(state.mapped if state is not None else mapping.mapped if mapping else False)
    guided_status = state.status if state is not None else None

    if roadmap_node_id is None:
        return roadmap_node_id, roadmap_mapped, guided_status, [], [], [], []

    nodes = _nodes_by_id(session)
    incoming_edges = _incoming_edges_by_target(session).get(roadmap_node_id, [])
    satisfied = _satisfied_node_ids(session, block_progress_by_id)
    for other_state in overview.subject_states.values():
        if other_state.roadmap_node_id and other_state.status in {"entry", "available", "reviewable"}:
            satisfied.add(other_state.roadmap_node_id)

    direct: list[FreeStudyRoadmapNodeBrief] = []
    missing_required: list[FreeStudyRoadmapNodeBrief] = []
    missing_cross_required: list[FreeStudyRoadmapNodeBrief] = []
    missing_recommended: list[FreeStudyRoadmapNodeBrief] = []

    for edge in sorted(incoming_edges, key=lambda item: (item.relation_type, item.from_node_id)):
        node = nodes.get(edge.from_node_id)
        if node is None:
            continue
        brief = _node_brief(node, edge)
        direct.append(brief)
        if edge.from_node_id in satisfied:
            continue
        if edge.relation_type == "required":
            missing_required.append(brief)
        elif edge.relation_type == "cross_required":
            missing_cross_required.append(brief)
        elif edge.relation_type in {"recommended", "cross_support"}:
            missing_recommended.append(brief)

    guided_status = _derive_guided_status(
        roadmap_mapped=roadmap_mapped,
        current_status=guided_status,
        direct_count=len(direct),
        missing_required_count=len(missing_required),
        missing_cross_required_count=len(missing_cross_required),
    )

    return (
        roadmap_node_id,
        roadmap_mapped,
        guided_status,
        direct,
        missing_required,
        missing_cross_required,
        missing_recommended,
    )


def get_free_study_subject_context(session: Session, subject_id: int) -> FreeStudySubjectContextResponse:
    subject = session.get(Subject, subject_id)
    if subject is None or not subject.ativo:
        raise ValueError("Assunto nao encontrado.")

    primary_block = _primary_blocks_by_subject(session).get(subject_id)
    normalized = normalize_discipline(subject.disciplina)
    (
        roadmap_node_id,
        roadmap_mapped,
        guided_status,
        direct,
        missing_required,
        missing_cross_required,
        missing_recommended,
    ) = _context_parts(session, subject)
    warning_level, warning_message = _warning(
        roadmap_mapped=roadmap_mapped,
        guided_status=guided_status,
        missing_required_count=len(missing_required),
        missing_cross_required_count=len(missing_cross_required),
        missing_soft_count=len(missing_recommended),
    )

    return FreeStudySubjectContextResponse(
        subject_id=subject_id,
        subject_name=_subject_label(subject),
        discipline=subject.disciplina,
        strategic_discipline=normalized.strategic_discipline or None,
        subarea=subject.assunto or normalized.subarea or None,
        block_id=primary_block.block_id if primary_block else None,
        block_name=primary_block.block_name if primary_block else None,
        roadmap_node_id=roadmap_node_id,
        roadmap_mapped=roadmap_mapped,
        free_study_allowed=True,
        guided_status=guided_status or "unmapped",
        warning_level=warning_level,  # type: ignore[arg-type]
        warning_message=warning_message,
        direct_prerequisites=direct,
        missing_required_nodes=missing_required,
        missing_cross_required_nodes=missing_cross_required,
        missing_recommended_nodes=missing_recommended,
    )


def get_free_study_catalog(session: Session) -> FreeStudyCatalogResponse:
    subjects = session.exec(
        select(Subject)
        .where(Subject.ativo == True)  # noqa: E712
        .order_by(Subject.disciplina, Subject.assunto, Subject.subassunto, Subject.id)
    ).all()
    primary_blocks = _primary_blocks_by_subject(session)
    block_progress_by_id = _block_progress_by_id(session)
    overview = build_guided_roadmap_overview(session, block_progress_by_id)
    mapping_by_subject = build_subject_roadmap_mapping(session)
    incoming_edges = _incoming_edges_by_target(session)
    satisfied = _satisfied_node_ids(session, block_progress_by_id)
    for other_state in overview.subject_states.values():
        if other_state.roadmap_node_id and other_state.status in {"entry", "available", "reviewable"}:
            satisfied.add(other_state.roadmap_node_id)

    grouped: dict[str, dict[str, object]] = {}
    for subject in subjects:
        if subject.id is None:
            continue
        normalized = normalize_discipline(subject.disciplina)
        strategic = normalized.strategic_discipline or subject.disciplina
        subarea = subject.assunto or normalized.subarea or subject.disciplina
        discipline_bucket = grouped.setdefault(
            subject.disciplina,
            {
                "strategic": strategic,
                "subareas": {},
            },
        )
        subareas = discipline_bucket["subareas"]
        assert isinstance(subareas, dict)
        subject_items = subareas.setdefault(subarea, [])
        assert isinstance(subject_items, list)

        state = overview.subject_states.get(subject.id)
        mapping = mapping_by_subject.get(subject.id)
        roadmap_node_id = state.roadmap_node_id if state is not None else mapping.roadmap_node_id if mapping else None
        roadmap_mapped = bool(state.mapped if state is not None else mapping.mapped if mapping else False)
        roadmap_status = state.status if state is not None else None
        direct_edges = incoming_edges.get(roadmap_node_id or "", [])
        missing_required_count = sum(
            1
            for edge in direct_edges
            if edge.relation_type == "required" and edge.from_node_id not in satisfied
        )
        missing_cross_required_count = sum(
            1
            for edge in direct_edges
            if edge.relation_type == "cross_required" and edge.from_node_id not in satisfied
        )
        missing_soft_count = sum(
            1
            for edge in direct_edges
            if edge.relation_type in {"recommended", "cross_support"} and edge.from_node_id not in satisfied
        )
        roadmap_status = _derive_guided_status(
            roadmap_mapped=roadmap_mapped,
            current_status=roadmap_status,
            direct_count=len(direct_edges),
            missing_required_count=missing_required_count,
            missing_cross_required_count=missing_cross_required_count,
        )
        warning_level, warning_message = _warning(
            roadmap_mapped=roadmap_mapped,
            guided_status=roadmap_status,
            missing_required_count=missing_required_count,
            missing_cross_required_count=missing_cross_required_count,
            missing_soft_count=missing_soft_count,
        )
        primary_block = primary_blocks.get(subject.id)

        subject_items.append(
            FreeStudySubjectCatalogItem(
                subject_id=subject.id,
                subject_name=_subject_label(subject),
                block_id=primary_block.block_id if primary_block else None,
                block_name=primary_block.block_name if primary_block else None,
                roadmap_node_id=roadmap_node_id,
                roadmap_mapped=roadmap_mapped,
                roadmap_status=roadmap_status,  # type: ignore[arg-type]
                free_study_allowed=True,
                warning_level=warning_level,  # type: ignore[arg-type]
                warning_message=warning_message,
            )
        )

    disciplines: list[FreeStudyCatalogDiscipline] = []
    for discipline_name, payload in grouped.items():
        subareas_payload = payload["subareas"]
        assert isinstance(subareas_payload, dict)
        disciplines.append(
            FreeStudyCatalogDiscipline(
                discipline=discipline_name,
                strategic_discipline=str(payload["strategic"]),
                subareas=[
                    FreeStudyCatalogSubarea(subarea=subarea_name, subjects=subjects_payload)
                    for subarea_name, subjects_payload in subareas_payload.items()
                ],
            )
        )

    return FreeStudyCatalogResponse(disciplines=disciplines)
