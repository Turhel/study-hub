from __future__ import annotations

import unicodedata

from sqlmodel import Session, select

from app.db import get_session
from app.models import RoadmapEdge, RoadmapNode
from app.schemas import RoadmapDisciplineItem, RoadmapEdgeResponse, RoadmapNodeResponse


class RoadmapQueryError(ValueError):
    pass


def normalize_discipline(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip())
    ascii_only = "".join(char for char in normalized if not unicodedata.combining(char))
    return ascii_only.casefold()


def list_roadmap_disciplines(session: Session | None = None) -> list[RoadmapDisciplineItem]:
    own_session = session is None
    db = session or get_session()
    try:
        nodes = list(db.exec(select(RoadmapNode).where(RoadmapNode.ativo == True)))  # noqa: E712
        grouped: dict[str, RoadmapDisciplineItem] = {}
        for node in nodes:
            key = normalize_discipline(node.disciplina)
            current = grouped.get(key)
            if current is None:
                grouped[key] = RoadmapDisciplineItem(
                    discipline=node.disciplina,
                    strategic_discipline=node.disciplina_estrategica,
                    node_count=1,
                )
            else:
                current.node_count += 1
        return sorted(grouped.values(), key=lambda item: normalize_discipline(item.discipline))
    finally:
        if own_session:
            db.close()


def get_roadmap_nodes_by_discipline(discipline: str, session: Session | None = None) -> list[RoadmapNodeResponse]:
    own_session = session is None
    db = session or get_session()
    try:
        wanted = normalize_discipline(discipline)
        nodes = [
            node
            for node in db.exec(select(RoadmapNode).order_by(RoadmapNode.node_id.asc()))
            if normalize_discipline(node.disciplina) == wanted
        ]
        if not nodes:
            raise RoadmapQueryError("Disciplina do roadmap nao encontrada.")

        return [
            RoadmapNodeResponse(
                node_id=node.node_id,
                strategic_discipline=node.disciplina_estrategica,
                discipline=node.disciplina,
                subject_area=node.materia,
                content=node.conteudo,
                subunit=node.subunidade,
                short_description=node.descricao_curta,
                pedagogical_size=node.tamanho_pedagogico,
                expected_contacts_min=node.expected_contacts_min,
                expected_contacts_target=node.expected_contacts_target,
                cadence_base=node.cadencia_base,
                frequency_base=node.frequencia_base,
                recurrence_weight=node.peso_recorrencia,
                strategic_weight=node.peso_estrategico,
                node_type=node.tipo_no,
                free_mode=node.free_mode,
                active=node.ativo,
                notes=node.observacoes,
            )
            for node in nodes
        ]
    finally:
        if own_session:
            db.close()


def get_roadmap_edges_by_discipline(discipline: str, session: Session | None = None) -> list[RoadmapEdgeResponse]:
    own_session = session is None
    db = session or get_session()
    try:
        wanted = normalize_discipline(discipline)
        node_ids = {
            node.node_id
            for node in db.exec(select(RoadmapNode))
            if normalize_discipline(node.disciplina) == wanted
        }
        if not node_ids:
            raise RoadmapQueryError("Disciplina do roadmap nao encontrada.")

        edges = list(
            db.exec(select(RoadmapEdge).order_by(RoadmapEdge.from_node_id.asc(), RoadmapEdge.to_node_id.asc()))
        )
        filtered = [
            edge
            for edge in edges
            if edge.from_node_id in node_ids or edge.to_node_id in node_ids
        ]
        return [
            RoadmapEdgeResponse(
                from_node_id=edge.from_node_id,
                to_node_id=edge.to_node_id,
                relation_type=edge.relation_type,  # type: ignore[arg-type]
                strength=edge.strength,
                notes=edge.notes,
            )
            for edge in filtered
        ]
    finally:
        if own_session:
            db.close()
