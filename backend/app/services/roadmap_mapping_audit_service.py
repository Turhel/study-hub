from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass

from sqlmodel import Session, select

from app.db import get_session
from app.models import RoadmapNode, Subject
from app.schemas import (
    RoadmapMappingCandidate,
    RoadmapMappingCoverageResponse,
    RoadmapMappingDisciplineResponse,
    RoadmapMappingDisciplineSummary,
    RoadmapMappingGapsResponse,
    RoadmapMappingNodeBrief,
    RoadmapMappingSubjectAuditItem,
    RoadmapMappingSubjectBrief,
)
from app.services.roadmap_query_service import RoadmapQueryError, normalize_discipline


EXAMPLE_LIMIT = 20
MAPPED_SCORE_THRESHOLD = 0.55
AMBIGUOUS_SCORE_THRESHOLD = 0.35
AMBIGUOUS_SCORE_GAP = 0.12
STOPWORDS = {
    "a",
    "as",
    "ao",
    "aos",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "o",
    "os",
    "para",
    "por",
    "com",
    "sem",
    "basica",
    "basico",
    "geral",
    "introducao",
    "principais",
}


@dataclass(frozen=True)
class SubjectAudit:
    item: RoadmapMappingSubjectAuditItem
    discipline_key: str


def get_mapping_coverage(session: Session | None = None) -> RoadmapMappingCoverageResponse:
    own_session = session is None
    db = session or get_session()
    try:
        audits, _ = _build_audit(db)
        summaries = _discipline_summaries(audits)
        total = len(audits)
        mapped = sum(1 for audit in audits if audit.item.status == "mapped")
        unmapped = sum(1 for audit in audits if audit.item.status == "unmapped")
        ambiguous = sum(1 for audit in audits if audit.item.status == "ambiguous")
        return RoadmapMappingCoverageResponse(
            total_subjects=total,
            mapped_subjects=mapped,
            unmapped_subjects=unmapped,
            ambiguous_subjects=ambiguous,
            coverage_percent=_percent(mapped, total),
            disciplines=summaries,
        )
    finally:
        if own_session:
            db.close()


def get_mapping_gaps(
    discipline: str | None = None,
    session: Session | None = None,
) -> RoadmapMappingGapsResponse:
    own_session = session is None
    db = session or get_session()
    try:
        audits, nodes = _build_audit(db)
        discipline_key = normalize_discipline(discipline) if discipline else None
        filtered_audits = [
            audit
            for audit in audits
            if discipline_key is None or audit.discipline_key == discipline_key
        ]
        mapped_node_ids = {
            candidate.node.node_id
            for audit in filtered_audits
            if audit.item.status in {"mapped", "ambiguous"}
            for candidate in audit.item.best_candidates
        }
        filtered_nodes = [
            node
            for node in nodes
            if discipline_key is None or normalize_discipline(node.disciplina) == discipline_key
        ]
        return RoadmapMappingGapsResponse(
            discipline=discipline,
            unmapped_subjects=[
                audit.item for audit in filtered_audits if audit.item.status == "unmapped"
            ][:EXAMPLE_LIMIT],
            roadmap_nodes_without_subject=[
                _node_brief(node) for node in filtered_nodes if node.node_id not in mapped_node_ids
            ][:EXAMPLE_LIMIT],
            ambiguous_subjects=[
                audit.item for audit in filtered_audits if audit.item.status == "ambiguous"
            ][:EXAMPLE_LIMIT],
        )
    finally:
        if own_session:
            db.close()


def get_mapping_discipline(
    discipline: str,
    session: Session | None = None,
) -> RoadmapMappingDisciplineResponse:
    own_session = session is None
    db = session or get_session()
    try:
        audits, _ = _build_audit(db)
        wanted = normalize_discipline(discipline)
        filtered = [audit for audit in audits if audit.discipline_key == wanted]
        if not filtered:
            raise RoadmapQueryError("Disciplina sem subjects para auditoria de mapeamento.")

        total = len(filtered)
        mapped = [audit.item for audit in filtered if audit.item.status == "mapped"]
        unmapped = [audit.item for audit in filtered if audit.item.status == "unmapped"]
        ambiguous = [audit.item for audit in filtered if audit.item.status == "ambiguous"]
        canonical_discipline = filtered[0].item.subject.discipline
        return RoadmapMappingDisciplineResponse(
            discipline=canonical_discipline,
            total_subjects=total,
            mapped_subjects=len(mapped),
            unmapped_subjects=len(unmapped),
            ambiguous_subjects=len(ambiguous),
            coverage_percent=_percent(len(mapped), total),
            mapped_examples=mapped[:EXAMPLE_LIMIT],
            unmapped_examples=unmapped[:EXAMPLE_LIMIT],
            ambiguous_examples=ambiguous[:EXAMPLE_LIMIT],
        )
    finally:
        if own_session:
            db.close()


def _build_audit(db: Session) -> tuple[list[SubjectAudit], list[RoadmapNode]]:
    subject_query = select(Subject).where(Subject.ativo == True).order_by(Subject.disciplina, Subject.id)  # noqa: E712
    node_query = select(RoadmapNode).where(RoadmapNode.ativo == True).order_by(RoadmapNode.node_id)  # noqa: E712
    subjects = list(db.exec(subject_query))
    nodes = list(db.exec(node_query))
    nodes_by_discipline: dict[str, list[RoadmapNode]] = defaultdict(list)
    for node in nodes:
        nodes_by_discipline[normalize_discipline(node.disciplina)].append(node)

    audits = [
        SubjectAudit(
            item=_audit_subject(subject, nodes_by_discipline.get(normalize_discipline(subject.disciplina), [])),
            discipline_key=normalize_discipline(subject.disciplina),
        )
        for subject in subjects
    ]
    return audits, nodes


def _audit_subject(subject: Subject, candidate_nodes: list[RoadmapNode]) -> RoadmapMappingSubjectAuditItem:
    scored_candidates = [
        candidate
        for candidate in (_score_candidate(subject, node) for node in candidate_nodes)
        if candidate.score >= AMBIGUOUS_SCORE_THRESHOLD
    ]
    scored_candidates.sort(key=lambda item: (-item.score, item.node.node_id))
    status = _status_for_candidates(scored_candidates)
    return RoadmapMappingSubjectAuditItem(
        subject=_subject_brief(subject),
        status=status,
        best_candidates=scored_candidates[:5],
    )


def _status_for_candidates(candidates: list[RoadmapMappingCandidate]) -> str:
    if not candidates:
        return "unmapped"
    best = candidates[0].score
    if best < MAPPED_SCORE_THRESHOLD:
        return "ambiguous"
    has_close_second_match = (
        len(candidates) > 1
        and candidates[1].score >= MAPPED_SCORE_THRESHOLD
        and best - candidates[1].score <= AMBIGUOUS_SCORE_GAP
    )
    if has_close_second_match:
        return "ambiguous"
    return "mapped"


def _score_candidate(subject: Subject, node: RoadmapNode) -> RoadmapMappingCandidate:
    subject_terms = _terms(_subject_label(subject))
    node_terms = _terms(_node_label(node))
    matched_terms = sorted(subject_terms & node_terms)
    if not subject_terms:
        score = 0.0
    else:
        score = len(matched_terms) / len(subject_terms)
    if _normalize_text(_subject_label(subject)) in _normalize_text(_node_label(node)):
        score = max(score, 0.9)
    return RoadmapMappingCandidate(
        node=_node_brief(node),
        score=round(score, 3),
        matched_terms=matched_terms,
    )


def _discipline_summaries(audits: list[SubjectAudit]) -> list[RoadmapMappingDisciplineSummary]:
    grouped: dict[str, list[SubjectAudit]] = defaultdict(list)
    for audit in audits:
        grouped[audit.item.subject.discipline].append(audit)

    summaries: list[RoadmapMappingDisciplineSummary] = []
    for discipline, items in grouped.items():
        total = len(items)
        mapped = sum(1 for item in items if item.item.status == "mapped")
        ambiguous = sum(1 for item in items if item.item.status == "ambiguous")
        unmapped = sum(1 for item in items if item.item.status == "unmapped")
        summaries.append(
            RoadmapMappingDisciplineSummary(
                discipline=discipline,
                total_subjects=total,
                mapped_subjects=mapped,
                unmapped_subjects=unmapped,
                ambiguous_subjects=ambiguous,
                coverage_percent=_percent(mapped, total),
            )
        )
    return sorted(summaries, key=lambda item: normalize_discipline(item.discipline))


def _subject_brief(subject: Subject) -> RoadmapMappingSubjectBrief:
    return RoadmapMappingSubjectBrief(
        subject_id=subject.id or 0,
        discipline=subject.disciplina,
        subject=subject.assunto,
        subsubject=subject.subassunto,
        label=_subject_label(subject),
    )


def _node_brief(node: RoadmapNode) -> RoadmapMappingNodeBrief:
    return RoadmapMappingNodeBrief(
        node_id=node.node_id,
        discipline=node.disciplina,
        subject_area=node.materia,
        content=node.conteudo,
        subunit=node.subunidade,
        label=_node_label(node),
    )


def _subject_label(subject: Subject) -> str:
    parts = [subject.assunto, subject.subassunto]
    return " - ".join(part for part in parts if part)


def _node_label(node: RoadmapNode) -> str:
    parts = [node.materia, node.conteudo, node.subunidade]
    return " - ".join(part for part in parts if part)


def _terms(value: str) -> set[str]:
    return {
        part
        for part in _normalize_text(value).split()
        if len(part) >= 3 and part not in STOPWORDS
    }


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip())
    ascii_only = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", ascii_only.casefold()).strip()


def _percent(value: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round((value / total) * 100, 2)
