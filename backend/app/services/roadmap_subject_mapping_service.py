from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from sqlmodel import Session, select

from app.models import RoadmapNode, Subject
from app.services.roadmap_query_service import normalize_discipline


_STOPWORDS = {
    "a",
    "as",
    "o",
    "os",
    "de",
    "da",
    "das",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "para",
    "por",
    "com",
}


@dataclass(frozen=True)
class SubjectRoadmapMapping:
    subject_id: int
    discipline: str
    roadmap_node_id: str | None
    mapped: bool
    confidence_score: float
    reason: str


@dataclass(frozen=True)
class _PreparedNode:
    node: RoadmapNode
    discipline_key: str
    materia_norm: str
    conteudo_norm: str
    subunidade_norm: str
    full_norm: str
    materia_tokens: set[str]
    conteudo_tokens: set[str]
    subunidade_tokens: set[str]
    full_tokens: set[str]


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value.strip())
    ascii_only = "".join(char for char in normalized if not unicodedata.combining(char))
    cleaned = re.sub(r"[^a-zA-Z0-9]+", " ", ascii_only.casefold())
    return re.sub(r"\s+", " ", cleaned).strip()


def _tokenize(value: str | None) -> set[str]:
    normalized = _normalize_text(value)
    if not normalized:
        return set()
    return {
        token
        for token in normalized.split()
        if token and token not in _STOPWORDS and len(token) > 1
    }


def _coverage(source_tokens: set[str], target_tokens: set[str]) -> float:
    if not source_tokens:
        return 0.0
    return len(source_tokens & target_tokens) / len(source_tokens)


def _prepare_nodes(session: Session, discipline_filter: str | None = None) -> dict[str, list[_PreparedNode]]:
    nodes = session.exec(select(RoadmapNode).where(RoadmapNode.ativo == True)).all()  # noqa: E712
    grouped: dict[str, list[_PreparedNode]] = {}

    wanted = normalize_discipline(discipline_filter) if discipline_filter else None
    for node in nodes:
        discipline_key = normalize_discipline(node.disciplina)
        if wanted is not None and discipline_key != wanted:
            continue
        full_norm = " ".join(
            part for part in [_normalize_text(node.materia), _normalize_text(node.conteudo), _normalize_text(node.subunidade)] if part
        )
        prepared = _PreparedNode(
            node=node,
            discipline_key=discipline_key,
            materia_norm=_normalize_text(node.materia),
            conteudo_norm=_normalize_text(node.conteudo),
            subunidade_norm=_normalize_text(node.subunidade),
            full_norm=full_norm,
            materia_tokens=_tokenize(node.materia),
            conteudo_tokens=_tokenize(node.conteudo),
            subunidade_tokens=_tokenize(node.subunidade),
            full_tokens=_tokenize(full_norm),
        )
        grouped.setdefault(discipline_key, []).append(prepared)

    return grouped


def _score_mapping(subject: Subject, candidate: _PreparedNode) -> tuple[float, str]:
    assunto_norm = _normalize_text(subject.assunto)
    subassunto_norm = _normalize_text(subject.subassunto)
    assunto_tokens = _tokenize(subject.assunto)
    subassunto_tokens = _tokenize(subject.subassunto)
    subject_full_norm = " ".join(part for part in [assunto_norm, subassunto_norm] if part)
    score = 0.0
    reasons: list[str] = []

    if subassunto_norm:
        if subassunto_norm == candidate.subunidade_norm:
            score += 130.0
            reasons.append("subassunto=subunidade")
        elif subassunto_norm == candidate.conteudo_norm:
            score += 110.0
            reasons.append("subassunto=conteudo")
        elif subassunto_norm == candidate.materia_norm:
            score += 90.0
            reasons.append("subassunto=materia")
        elif subassunto_norm in candidate.full_norm and len(subassunto_norm) >= 5:
            score += 45.0
            reasons.append("subassunto contido no node")

    if assunto_norm:
        if assunto_norm == candidate.materia_norm:
            score += 35.0
            reasons.append("assunto=materia")
        elif assunto_norm == candidate.conteudo_norm:
            score += 28.0
            reasons.append("assunto=conteudo")
        elif assunto_norm in candidate.full_norm and len(assunto_norm) >= 5:
            score += 15.0
            reasons.append("assunto contido no node")

    if subject_full_norm and subject_full_norm == candidate.full_norm:
        score += 150.0
        reasons.append("descricao completa igual")

    subassunto_coverage = _coverage(subassunto_tokens, candidate.full_tokens)
    assunto_coverage = _coverage(assunto_tokens, candidate.full_tokens)
    score += subassunto_coverage * 85.0
    score += assunto_coverage * 30.0

    if subassunto_coverage >= 0.75:
        reasons.append("alta cobertura do subassunto")
    if assunto_coverage >= 0.75:
        reasons.append("alta cobertura do assunto")

    return score, ", ".join(reasons) or "sem sinal forte"


def build_subject_roadmap_mapping(
    session: Session,
    discipline_filter: str | None = None,
) -> dict[int, SubjectRoadmapMapping]:
    subjects = session.exec(select(Subject).where(Subject.ativo == True)).all()  # noqa: E712
    prepared_nodes = _prepare_nodes(session, discipline_filter=discipline_filter)
    wanted = normalize_discipline(discipline_filter) if discipline_filter else None
    result: dict[int, SubjectRoadmapMapping] = {}

    for subject in subjects:
        if subject.id is None:
            continue
        discipline_key = normalize_discipline(subject.disciplina)
        if wanted is not None and discipline_key != wanted:
            continue

        candidates = prepared_nodes.get(discipline_key, [])
        ranked: list[tuple[float, str, _PreparedNode]] = []
        for candidate in candidates:
            score, reason = _score_mapping(subject, candidate)
            if score > 0:
                ranked.append((score, reason, candidate))
        ranked.sort(key=lambda item: (-item[0], item[2].node.node_id))

        if not ranked:
            result[subject.id] = SubjectRoadmapMapping(
                subject_id=subject.id,
                discipline=subject.disciplina,
                roadmap_node_id=None,
                mapped=False,
                confidence_score=0.0,
                reason="Sem correspondencia forte entre assunto/subassunto e node do roadmap.",
            )
            continue

        top_score, top_reason, top_candidate = ranked[0]
        second_score = ranked[1][0] if len(ranked) > 1 else 0.0
        if top_score < 90.0:
            result[subject.id] = SubjectRoadmapMapping(
                subject_id=subject.id,
                discipline=subject.disciplina,
                roadmap_node_id=None,
                mapped=False,
                confidence_score=round(top_score, 2),
                reason="Correspondencia insuficiente para mapear com confianca.",
            )
            continue

        if second_score and top_score - second_score < 8.0:
            result[subject.id] = SubjectRoadmapMapping(
                subject_id=subject.id,
                discipline=subject.disciplina,
                roadmap_node_id=None,
                mapped=False,
                confidence_score=round(top_score, 2),
                reason="Mapeamento ambiguo entre multiplos nodes do roadmap.",
            )
            continue

        result[subject.id] = SubjectRoadmapMapping(
            subject_id=subject.id,
            discipline=subject.disciplina,
            roadmap_node_id=top_candidate.node.node_id,
            mapped=True,
            confidence_score=round(top_score, 2),
            reason=f"Mapeado por correspondencia deterministica: {top_reason}.",
        )

    return result
