from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher

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
from app.services.roadmap_query_service import RoadmapQueryError
from app.services.roadmap_subject_mapping_service import (
    SubjectRoadmapMappingDiagnostic,
    build_subject_roadmap_mapping_diagnostics,
    normalize_mapping_discipline,
    summarize_subject_roadmap_mapping,
)


EXAMPLE_LIMIT = 20


@dataclass(frozen=True)
class SubjectAudit:
    item: RoadmapMappingSubjectAuditItem
    discipline_key: str


def _discipline_lookup_key(value: str | None) -> str:
    return normalize_mapping_discipline(value or "").replace(" ", "")


def _resolve_discipline_key(requested: str | None, available_keys: set[str]) -> str | None:
    if requested is None:
        return None
    direct = _discipline_lookup_key(requested)
    if direct in available_keys:
        return direct
    best_match: str | None = None
    best_score = 0.0
    for candidate in available_keys:
        score = SequenceMatcher(None, direct, candidate).ratio()
        if score > best_score:
            best_score = score
            best_match = candidate
    if best_match is not None and best_score >= 0.8:
        return best_match
    return direct


def get_mapping_coverage(session: Session | None = None) -> RoadmapMappingCoverageResponse:
    own_session = session is None
    db = session or get_session()
    try:
        audits, _, diagnostics = _build_audit(db)
        summaries = _discipline_summaries(audits)
        mapping_summary = summarize_subject_roadmap_mapping(
            {subject_id: diagnostic.mapping for subject_id, diagnostic in diagnostics.items()}
        )
        ambiguous = sum(1 for audit in audits if audit.item.status == "ambiguous")
        return RoadmapMappingCoverageResponse(
            total_subjects=mapping_summary.total_subjects,
            mapped_subjects=mapping_summary.mapped_subjects,
            override_mapped_subjects=mapping_summary.override_mapped_subjects,
            heuristic_mapped_subjects=mapping_summary.heuristic_mapped_subjects,
            unmapped_subjects=mapping_summary.unmapped_subjects,
            ambiguous_subjects=ambiguous,
            coverage_percent=_percent(mapping_summary.mapped_subjects, mapping_summary.total_subjects),
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
        audits, nodes, _ = _build_audit(db)
        available_keys = {audit.discipline_key for audit in audits}
        discipline_key = _resolve_discipline_key(discipline, available_keys) if discipline else None
        filtered_audits = [
            audit
            for audit in audits
            if discipline_key is None or audit.discipline_key == discipline_key
        ]
        mapped_node_ids = {
            audit.item.mapped_node_id
            for audit in filtered_audits
            if audit.item.mapped_node_id
        }
        filtered_nodes = [
            node
            for node in nodes
            if discipline_key is None or _discipline_lookup_key(node.disciplina) == discipline_key
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
        audits, _, diagnostics = _build_audit(db)
        wanted = _resolve_discipline_key(discipline, {audit.discipline_key for audit in audits})
        filtered = [audit for audit in audits if audit.discipline_key == wanted]
        if not filtered:
            raise RoadmapQueryError("Disciplina sem subjects para auditoria de mapeamento.")

        filtered_diagnostics = {
            audit.item.subject.subject_id: diagnostics[audit.item.subject.subject_id].mapping
            for audit in filtered
        }
        summary = summarize_subject_roadmap_mapping(filtered_diagnostics)
        ambiguous = [audit.item for audit in filtered if audit.item.status == "ambiguous"]
        canonical_discipline = filtered[0].item.subject.discipline
        mapped = [audit.item for audit in filtered if audit.item.status == "mapped"]
        unmapped = [audit.item for audit in filtered if audit.item.status == "unmapped"]
        return RoadmapMappingDisciplineResponse(
            discipline=canonical_discipline,
            total_subjects=summary.total_subjects,
            mapped_subjects=summary.mapped_subjects,
            override_mapped_subjects=summary.override_mapped_subjects,
            heuristic_mapped_subjects=summary.heuristic_mapped_subjects,
            unmapped_subjects=summary.unmapped_subjects,
            ambiguous_subjects=len(ambiguous),
            coverage_percent=_percent(summary.mapped_subjects, summary.total_subjects),
            mapped_examples=mapped[:EXAMPLE_LIMIT],
            unmapped_examples=unmapped[:EXAMPLE_LIMIT],
            ambiguous_examples=ambiguous[:EXAMPLE_LIMIT],
        )
    finally:
        if own_session:
            db.close()


def _build_audit(
    db: Session,
) -> tuple[list[SubjectAudit], list[RoadmapNode], dict[int, SubjectRoadmapMappingDiagnostic]]:
    subject_query = select(Subject).where(Subject.ativo == True).order_by(Subject.disciplina, Subject.id)  # noqa: E712
    node_query = select(RoadmapNode).where(RoadmapNode.ativo == True).order_by(RoadmapNode.node_id)  # noqa: E712
    subjects = list(db.exec(subject_query))
    nodes = list(db.exec(node_query))
    diagnostics = build_subject_roadmap_mapping_diagnostics(db)
    audits = [
        SubjectAudit(
            item=_audit_subject(subject, diagnostics.get(subject.id or 0)),
            discipline_key=_discipline_lookup_key(subject.disciplina),
        )
        for subject in subjects
        if subject.id is not None
    ]
    return audits, nodes, diagnostics


def _audit_subject(
    subject: Subject,
    diagnostic: SubjectRoadmapMappingDiagnostic | None,
) -> RoadmapMappingSubjectAuditItem:
    if diagnostic is None:
        return RoadmapMappingSubjectAuditItem(
            subject=_subject_brief(subject),
            status="unmapped",
            mapping_source="unmapped",
            mapping_confidence=0.0,
            mapping_reason="Subject sem diagnostico de mapeamento.",
            relevant_candidate_count=0,
            mapped_node_id=None,
            best_candidates=[],
        )

    mapping = diagnostic.mapping
    status = _status_from_mapping(mapping.reason, mapping.mapped)
    return RoadmapMappingSubjectAuditItem(
        subject=_subject_brief(subject),
        status=status,
        mapping_source=mapping.mapping_source,
        mapping_confidence=round(mapping.confidence_score, 2),
        mapping_reason=mapping.reason,
        relevant_candidate_count=mapping.relevant_candidate_count,
        mapped_node_id=mapping.roadmap_node_id,
        best_candidates=[
            RoadmapMappingCandidate(
                node=RoadmapMappingNodeBrief(
                    node_id=candidate.roadmap_node_id,
                    discipline=candidate.discipline,
                    subject_area=candidate.subject_area,
                    content=candidate.content,
                    subunit=candidate.subunit,
                    label=_node_label_from_parts(
                        candidate.subject_area,
                        candidate.content,
                        candidate.subunit,
                    ),
                ),
                score=candidate.score,
                matched_terms=list(candidate.matched_terms),
            )
            for candidate in diagnostic.candidates
        ],
    )


def _status_from_mapping(reason: str, mapped: bool) -> str:
    if mapped:
        return "mapped"
    normalized_reason = reason.casefold()
    if "ambigu" in normalized_reason:
        return "ambiguous"
    return "unmapped"


def _discipline_summaries(audits: list[SubjectAudit]) -> list[RoadmapMappingDisciplineSummary]:
    grouped: dict[str, list[SubjectAudit]] = defaultdict(list)
    for audit in audits:
        grouped[audit.item.subject.discipline].append(audit)

    summaries: list[RoadmapMappingDisciplineSummary] = []
    for discipline, items in grouped.items():
        total = len(items)
        mapped = [item for item in items if item.item.status == "mapped"]
        override_mapped = sum(1 for item in mapped if item.item.mapping_source == "override")
        heuristic_mapped = sum(1 for item in mapped if item.item.mapping_source == "heuristic")
        unmapped = sum(1 for item in items if item.item.status == "unmapped")
        ambiguous = sum(1 for item in items if item.item.status == "ambiguous")
        summaries.append(
            RoadmapMappingDisciplineSummary(
                discipline=discipline,
                total_subjects=total,
                mapped_subjects=len(mapped),
                override_mapped_subjects=override_mapped,
                heuristic_mapped_subjects=heuristic_mapped,
                unmapped_subjects=unmapped,
                ambiguous_subjects=ambiguous,
                coverage_percent=_percent(len(mapped), total),
            )
        )
    return sorted(summaries, key=lambda item: normalize_mapping_discipline(item.discipline))


def _subject_brief(subject: Subject) -> RoadmapMappingSubjectBrief:
    return RoadmapMappingSubjectBrief(
        subject_id=subject.id or 0,
        discipline=subject.disciplina,
        subject=subject.assunto,
        subsubject=subject.subassunto,
        label=" - ".join(part for part in [subject.assunto, subject.subassunto] if part),
    )


def _node_brief(node: RoadmapNode) -> RoadmapMappingNodeBrief:
    return RoadmapMappingNodeBrief(
        node_id=node.node_id,
        discipline=node.disciplina,
        subject_area=node.materia,
        content=node.conteudo,
        subunit=node.subunidade,
        label=_node_label_from_parts(node.materia, node.conteudo, node.subunidade),
    )


def _node_label_from_parts(subject_area: str, content: str, subunit: str | None) -> str:
    return " - ".join(part for part in [subject_area, content, subunit] if part)


def _percent(value: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round((value / total) * 100, 2)
