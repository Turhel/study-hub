from __future__ import annotations

from collections import defaultdict, deque

from sqlmodel import Session, select

from app.db import get_session
from app.models import RoadmapBlockMap, RoadmapEdge, RoadmapNode
from app.schemas import (
    RoadmapDependencyItem,
    RoadmapDependentNodeResponse,
    RoadmapDisciplineEntryPathsResponse,
    RoadmapEntryPathItem,
    RoadmapNodeBrief,
    RoadmapNodeDepthItem,
    RoadmapNodeExplainResponse,
)
from app.services.roadmap_query_service import RoadmapQueryError, normalize_discipline


HARD_RELATION_TYPES = {"required", "cross_required"}
PATH_RELATION_TYPES = {"required", "recommended"}
ENTRY_PATH_LIMIT = 8
ENTRY_PATH_DEPTH = 4


def explain_roadmap_node(node_id: str, session: Session | None = None) -> RoadmapNodeExplainResponse:
    own_session = session is None
    db = session or get_session()
    try:
        nodes = _load_nodes(db)
        node = nodes.get(node_id)
        if node is None:
            raise RoadmapQueryError("Node do roadmap nao encontrado.")

        incoming_edges = _sorted_edges(db.exec(select(RoadmapEdge).where(RoadmapEdge.to_node_id == node_id)))
        outgoing_edges = _sorted_edges(db.exec(select(RoadmapEdge).where(RoadmapEdge.from_node_id == node_id)))

        incoming_dependencies = [
            _dependency_item(edge=edge, node=nodes.get(edge.from_node_id))
            for edge in incoming_edges
            if nodes.get(edge.from_node_id) is not None
        ]
        outgoing_dependents = [
            _dependency_item(edge=edge, node=nodes.get(edge.to_node_id))
            for edge in outgoing_edges
            if nodes.get(edge.to_node_id) is not None
        ]

        required_dependencies = _filter_dependencies(incoming_dependencies, "required")
        cross_required_dependencies = _filter_dependencies(incoming_dependencies, "cross_required")
        recommended_dependencies = _filter_dependencies(incoming_dependencies, "recommended")
        cross_support_dependencies = _filter_dependencies(incoming_dependencies, "cross_support")
        classification = _classify_node(
            incoming_dependencies=incoming_dependencies,
            required_dependencies=required_dependencies,
            cross_required_dependencies=cross_required_dependencies,
        )

        return RoadmapNodeExplainResponse(
            node_id=node.node_id,
            discipline=node.disciplina,
            subject_area=node.materia,
            content=node.conteudo,
            subunit=node.subunidade,
            incoming_dependencies=incoming_dependencies,
            required_dependencies=required_dependencies,
            cross_required_dependencies=cross_required_dependencies,
            recommended_dependencies=recommended_dependencies,
            cross_support_dependencies=cross_support_dependencies,
            outgoing_dependents=outgoing_dependents,
            classification=classification,
            message=_classification_message(classification, required_dependencies, cross_required_dependencies),
        )
    finally:
        if own_session:
            db.close()


def get_roadmap_node_dependents(node_id: str, session: Session | None = None) -> RoadmapDependentNodeResponse:
    own_session = session is None
    db = session or get_session()
    try:
        nodes = _load_nodes(db)
        node = nodes.get(node_id)
        if node is None:
            raise RoadmapQueryError("Node do roadmap nao encontrado.")

        outgoing_edges = _sorted_edges(db.exec(select(RoadmapEdge).where(RoadmapEdge.from_node_id == node_id)))
        direct_dependents = [
            _dependency_item(edge=edge, node=nodes.get(edge.to_node_id))
            for edge in outgoing_edges
            if nodes.get(edge.to_node_id) is not None
        ]

        second_level: list[RoadmapDependencyItem] = []
        seen: set[tuple[str, str]] = set()
        for dependency in direct_dependents:
            nested_edges = _sorted_edges(
                db.exec(select(RoadmapEdge).where(RoadmapEdge.from_node_id == dependency.node.node_id))
            )
            for edge in nested_edges:
                target = nodes.get(edge.to_node_id)
                key = (edge.to_node_id, edge.relation_type)
                if target is None or key in seen:
                    continue
                seen.add(key)
                second_level.append(_dependency_item(edge=edge, node=target))

        return RoadmapDependentNodeResponse(
            node=_node_brief(node),
            direct_dependents=direct_dependents,
            second_level_dependents=second_level[:20],
        )
    finally:
        if own_session:
            db.close()


def get_roadmap_discipline_entry_paths(
    discipline: str,
    session: Session | None = None,
) -> RoadmapDisciplineEntryPathsResponse:
    own_session = session is None
    db = session or get_session()
    try:
        wanted = normalize_discipline(discipline)
        nodes = _load_nodes(db)
        discipline_nodes = [
            node
            for node in sorted(nodes.values(), key=lambda item: item.node_id)
            if normalize_discipline(node.disciplina) == wanted
        ]
        if not discipline_nodes:
            raise RoadmapQueryError("Disciplina do roadmap nao encontrada.")

        node_ids = {node.node_id for node in discipline_nodes}
        edges = _sorted_edges(db.exec(select(RoadmapEdge)))
        incoming_hard = _incoming_hard_dependencies(edges)
        entry_nodes = _find_entry_nodes(db, discipline_nodes, incoming_hard)
        nodes_without_required = [node for node in discipline_nodes if node.node_id not in incoming_hard]
        adjacency = _discipline_adjacency(edges, node_ids)
        depths = _calculate_depths(entry_nodes, adjacency)

        return RoadmapDisciplineEntryPathsResponse(
            discipline=discipline_nodes[0].disciplina,
            entry_nodes=[_node_brief(node) for node in entry_nodes],
            nodes_without_required_dependencies=[_node_brief(node) for node in nodes_without_required],
            suggested_paths=_build_suggested_paths(entry_nodes, adjacency, nodes),
            node_depths=[
                RoadmapNodeDepthItem(node=_node_brief(node), depth=depths.get(node.node_id))
                for node in discipline_nodes
            ],
        )
    finally:
        if own_session:
            db.close()


def _load_nodes(db: Session) -> dict[str, RoadmapNode]:
    return {node.node_id: node for node in db.exec(select(RoadmapNode).order_by(RoadmapNode.node_id.asc()))}


def _node_brief(node: RoadmapNode) -> RoadmapNodeBrief:
    return RoadmapNodeBrief(
        node_id=node.node_id,
        discipline=node.disciplina,
        subject_area=node.materia,
        content=node.conteudo,
        subunit=node.subunidade,
    )


def _dependency_item(edge: RoadmapEdge, node: RoadmapNode | None) -> RoadmapDependencyItem:
    if node is None:
        raise RoadmapQueryError("Aresta do roadmap referencia node inexistente.")
    return RoadmapDependencyItem(
        node=_node_brief(node),
        relation_type=edge.relation_type,  # type: ignore[arg-type]
        strength=edge.strength,
        notes=edge.notes,
    )


def _sorted_edges(edges: object) -> list[RoadmapEdge]:
    return sorted(
        list(edges),
        key=lambda edge: (edge.from_node_id, edge.to_node_id, edge.relation_type),
    )


def _filter_dependencies(
    dependencies: list[RoadmapDependencyItem],
    relation_type: str,
) -> list[RoadmapDependencyItem]:
    return [dependency for dependency in dependencies if dependency.relation_type == relation_type]


def _classify_node(
    *,
    incoming_dependencies: list[RoadmapDependencyItem],
    required_dependencies: list[RoadmapDependencyItem],
    cross_required_dependencies: list[RoadmapDependencyItem],
) -> str:
    if cross_required_dependencies:
        return "blocked_by_cross_required"
    if required_dependencies:
        return "blocked_by_required"
    if not incoming_dependencies:
        return "entry"
    return "available_if_prereqs_met"


def _classification_message(
    classification: str,
    required_dependencies: list[RoadmapDependencyItem],
    cross_required_dependencies: list[RoadmapDependencyItem],
) -> str:
    if classification == "entry":
        return "Node de entrada estrutural: nao possui dependencias diretas."
    if classification == "available_if_prereqs_met":
        return "Node sem bloqueio forte: possui apenas dependencias recomendadas ou de suporte."
    if classification == "blocked_by_cross_required":
        count = len(cross_required_dependencies)
        return f"Node bloqueado por {count} dependencia(s) obrigatoria(s) cruzada(s)."
    count = len(required_dependencies)
    return f"Node bloqueado por {count} dependencia(s) obrigatoria(s) direta(s)."


def _incoming_hard_dependencies(edges: list[RoadmapEdge]) -> dict[str, list[RoadmapEdge]]:
    incoming: dict[str, list[RoadmapEdge]] = defaultdict(list)
    for edge in edges:
        if edge.relation_type in HARD_RELATION_TYPES:
            incoming[edge.to_node_id].append(edge)
    return incoming


def _find_entry_nodes(
    db: Session,
    discipline_nodes: list[RoadmapNode],
    incoming_hard: dict[str, list[RoadmapEdge]],
) -> list[RoadmapNode]:
    by_id = {node.node_id: node for node in discipline_nodes}
    wanted = normalize_discipline(discipline_nodes[0].disciplina)
    block_map_query = select(RoadmapBlockMap).order_by(
        RoadmapBlockMap.block_number.asc(),
        RoadmapBlockMap.sequence_in_block.asc(),
    )
    block_map = [
        item
        for item in db.exec(block_map_query)
        if normalize_discipline(item.disciplina) == wanted and item.node_id in by_id
    ]
    if block_map:
        first_block = min(item.block_number for item in block_map)
        entry_from_block = [
            by_id[item.node_id]
            for item in block_map
            if item.block_number == first_block and item.node_id not in incoming_hard
        ]
        if entry_from_block:
            return _unique_nodes(entry_from_block)

    return [node for node in discipline_nodes if node.node_id not in incoming_hard]


def _discipline_adjacency(
    edges: list[RoadmapEdge],
    node_ids: set[str],
) -> dict[str, list[RoadmapEdge]]:
    adjacency: dict[str, list[RoadmapEdge]] = defaultdict(list)
    for edge in edges:
        if (
            edge.from_node_id in node_ids
            and edge.to_node_id in node_ids
            and edge.relation_type in PATH_RELATION_TYPES
        ):
            adjacency[edge.from_node_id].append(edge)
    return adjacency


def _calculate_depths(
    entry_nodes: list[RoadmapNode],
    adjacency: dict[str, list[RoadmapEdge]],
) -> dict[str, int]:
    depths: dict[str, int] = {}
    queue: deque[tuple[str, int]] = deque((node.node_id, 0) for node in entry_nodes)
    while queue:
        node_id, depth = queue.popleft()
        current_depth = depths.get(node_id)
        if current_depth is not None and current_depth <= depth:
            continue
        depths[node_id] = depth
        for edge in adjacency.get(node_id, []):
            queue.append((edge.to_node_id, depth + 1))
    return depths


def _build_suggested_paths(
    entry_nodes: list[RoadmapNode],
    adjacency: dict[str, list[RoadmapEdge]],
    nodes: dict[str, RoadmapNode],
) -> list[RoadmapEntryPathItem]:
    paths: list[RoadmapEntryPathItem] = []
    for entry_node in entry_nodes[:ENTRY_PATH_LIMIT]:
        path_node_ids = [entry_node.node_id]
        relation_types: list[str] = []
        current = entry_node.node_id
        seen = {current}
        for _ in range(ENTRY_PATH_DEPTH - 1):
            next_edges = [edge for edge in adjacency.get(current, []) if edge.to_node_id not in seen]
            if not next_edges:
                break
            next_edge = sorted(next_edges, key=lambda edge: (edge.relation_type != "required", edge.to_node_id))[0]
            path_node_ids.append(next_edge.to_node_id)
            relation_types.append(next_edge.relation_type)
            current = next_edge.to_node_id
            seen.add(current)

        paths.append(
            RoadmapEntryPathItem(
                nodes=[_node_brief(nodes[node_id]) for node_id in path_node_ids if node_id in nodes],
                relation_types=relation_types,
            )
        )
    return paths


def _unique_nodes(nodes: list[RoadmapNode]) -> list[RoadmapNode]:
    seen: set[str] = set()
    unique: list[RoadmapNode] = []
    for node in nodes:
        if node.node_id in seen:
            continue
        seen.add(node.node_id)
        unique.append(node)
    return unique
