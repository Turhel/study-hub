from __future__ import annotations

import csv
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from sqlmodel import Session, select

from app.models import RoadmapNode, Subject


MappingSource = Literal["override", "heuristic", "unmapped"]


_STOPWORDS = {
    "a",
    "ao",
    "aos",
    "as",
    "com",
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
    "ou",
    "para",
    "por",
}

_GENERIC_TOKENS = {
    "basica",
    "basico",
    "geral",
    "gerais",
    "introducao",
    "tema",
    "teoria",
    "historico",
    "historia",
    "conteudo",
    "conceitos",
    "conceito",
    "estudo",
    "estrutura",
    "estruturas",
    "caracteristicas",
    "questao",
    "questoes",
    "analise",
    "sistema",
    "sistemas",
    "animal",
    "humana",
    "humano",
    "brasil",
}

_TOKEN_ALIASES = {
    "carboidrato": "glicidio",
    "carboidratos": "glicidios",
    "lipidio": "lipideo",
    "lipidios": "lipideos",
    "glicidio": "glicidios",
    "proteina": "proteinas",
    "enzima": "enzimas",
    "vitamina": "vitaminas",
    "angiosperma": "angiospermas",
    "briòfitas": "briofitas",
    "pteridofitas": "pteridofitas",
    "pre": "pre",
    "socratico": "socraticos",
    "socraticos": "socraticos",
    "tipos": "tipo",
    "generos": "genero",
    "textuais": "textual",
    "migracoes": "migracao",
    "migratorios": "migracao",
    "migratoria": "migracao",
    "imigracao": "migracao",
    "imigracoes": "migracao",
    "emigracao": "migracao",
    "emigracoes": "migracao",
    "regencia": "regencia",
    "crase": "crase",
    "operacoes": "operacao",
}

_PHRASE_EXPANSIONS = {
    "teste de dna": {"teste", "testes", "genetico", "geneticos", "engenharia", "genetica"},
    "teste de paternidade": {"teste", "testes", "genetico", "geneticos", "engenharia", "genetica"},
    "celulas tronco": {"clonagem", "engenharia", "genetica"},
    "terapia genica": {"engenharia", "genetica", "transgenia"},
    "transgenico": {"transgenia", "engenharia", "genetica"},
    "transgenicos": {"transgenia", "engenharia", "genetica"},
    "sintese proteica": {"transcricao", "traducao", "proteinas"},
    "acidos nucleicos transcricao e rna": {"transcricao", "traducao", "rna"},
    "fatores que influenciam a fotossintese": {"fotossintese"},
    "tipos e generos textuais": {"tipo", "genero", "textual", "discursivo"},
    "surgimento da filosofia": {"surgimento", "filosofia", "pre", "socraticos"},
    "idh indice de desenvolvimento humano": {"indicadores", "sociais", "socioeconomica"},
    "idh": {"indicadores", "sociais", "socioeconomica"},
    "populacao economicamente ativa": {"pea", "indicadores", "socioeconomica"},
}


@dataclass(frozen=True)
class SubjectRoadmapMapping:
    subject_id: int
    discipline: str
    roadmap_node_id: str | None
    mapped: bool
    mapping_source: MappingSource
    confidence_score: float
    reason: str
    relevant_candidate_count: int = 0


@dataclass(frozen=True)
class SubjectRoadmapMappingSummary:
    total_subjects: int
    mapped_subjects: int
    unmapped_subjects: int
    override_mapped_subjects: int
    heuristic_mapped_subjects: int


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


@dataclass(frozen=True)
class _OverrideItem:
    discipline_key: str
    subject_id: int
    roadmap_node_id: str
    notes: str


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _overrides_path() -> Path:
    return _repo_root() / "docs" / "roadmap" / "subject_node_overrides.csv"


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value.strip())
    ascii_only = "".join(char for char in normalized if not unicodedata.combining(char))
    cleaned = re.sub(r"[^a-zA-Z0-9]+", " ", ascii_only.casefold())
    return re.sub(r"\s+", " ", cleaned).strip()


def normalize_mapping_discipline(value: str) -> str:
    tokens = [token for token in _normalize_text(value).split() if token and token not in _STOPWORDS]
    return " ".join(tokens)


def _canonicalize_token(token: str) -> str:
    canonical = _TOKEN_ALIASES.get(token, token)
    if len(canonical) > 4 and canonical.endswith("s"):
        singular = canonical[:-1]
        if singular not in {"mais", "dois", "tres"}:
            canonical = _TOKEN_ALIASES.get(singular, singular)
    return canonical


def _tokenize(value: str | None) -> set[str]:
    normalized = _normalize_text(value)
    if not normalized:
        return set()
    tokens = set()
    for raw in normalized.split():
        if raw in _STOPWORDS or len(raw) <= 1:
            continue
        canonical = _canonicalize_token(raw)
        if canonical not in _GENERIC_TOKENS:
            tokens.add(canonical)
    for phrase, expanded_tokens in _PHRASE_EXPANSIONS.items():
        if phrase in normalized:
            tokens.update(expanded_tokens)
    return tokens


def _coverage(source_tokens: set[str], target_tokens: set[str]) -> float:
    if not source_tokens:
        return 0.0
    return len(source_tokens & target_tokens) / len(source_tokens)


def _prepare_nodes(session: Session, discipline_filter: str | None = None) -> dict[str, list[_PreparedNode]]:
    nodes = session.exec(select(RoadmapNode).where(RoadmapNode.ativo == True)).all()  # noqa: E712
    grouped: dict[str, list[_PreparedNode]] = {}
    wanted = normalize_mapping_discipline(discipline_filter) if discipline_filter else None

    for node in nodes:
        discipline_key = normalize_mapping_discipline(node.disciplina)
        if wanted is not None and discipline_key != wanted:
            continue
        full_norm = " ".join(
            part
            for part in [_normalize_text(node.materia), _normalize_text(node.conteudo), _normalize_text(node.subunidade)]
            if part
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


def _load_overrides(session: Session) -> dict[int, _OverrideItem]:
    path = _overrides_path()
    if not path.exists():
        return {}

    subjects = {subject.id: subject for subject in session.exec(select(Subject)).all() if subject.id is not None}
    nodes = {node.node_id: node for node in session.exec(select(RoadmapNode)).all()}
    overrides: dict[int, _OverrideItem] = {}

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"discipline", "subject_id", "roadmap_node_id", "notes"}
        if reader.fieldnames is None or set(reader.fieldnames) < required:
            raise ValueError("subject_node_overrides.csv esta sem as colunas obrigatorias.")

        for row_index, row in enumerate(reader, start=2):
            subject_id_raw = (row.get("subject_id") or "").strip()
            if not subject_id_raw:
                continue
            try:
                subject_id = int(subject_id_raw)
            except ValueError as exc:
                raise ValueError(f"Override invalido na linha {row_index}: subject_id nao e inteiro.") from exc

            roadmap_node_id = (row.get("roadmap_node_id") or "").strip()
            if roadmap_node_id not in nodes:
                raise ValueError(
                    f"Override invalido na linha {row_index}: roadmap_node_id '{roadmap_node_id}' nao existe."
                )

            subject = subjects.get(subject_id)
            if subject is None:
                raise ValueError(f"Override invalido na linha {row_index}: subject_id {subject_id} nao existe.")

            subject_discipline = normalize_mapping_discipline(subject.disciplina)
            override_discipline = normalize_mapping_discipline(row.get("discipline") or "")
            node_discipline = normalize_mapping_discipline(nodes[roadmap_node_id].disciplina)
            if override_discipline and override_discipline != subject_discipline:
                raise ValueError(
                    f"Override invalido na linha {row_index}: disciplina do override nao bate com a do subject {subject_id}."
                )
            if subject_discipline != node_discipline:
                raise ValueError(
                    f"Override invalido na linha {row_index}: node {roadmap_node_id} pertence a outra disciplina."
                )

            overrides[subject_id] = _OverrideItem(
                discipline_key=subject_discipline,
                subject_id=subject_id,
                roadmap_node_id=roadmap_node_id,
                notes=(row.get("notes") or "").strip(),
            )

    return overrides


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
            score += 155.0
            reasons.append("subassunto=subunidade")
        elif subassunto_norm == candidate.conteudo_norm:
            score += 125.0
            reasons.append("subassunto=conteudo")
        elif subassunto_norm == candidate.materia_norm:
            score += 100.0
            reasons.append("subassunto=materia")
        elif subassunto_norm in candidate.full_norm and len(subassunto_norm) >= 4:
            score += 52.0
            reasons.append("subassunto contido no node")

    if assunto_norm:
        if assunto_norm == candidate.materia_norm:
            score += 48.0
            reasons.append("assunto=materia")
        elif assunto_norm == candidate.conteudo_norm:
            score += 36.0
            reasons.append("assunto=conteudo")
        elif assunto_norm in candidate.full_norm and len(assunto_norm) >= 4:
            score += 18.0
            reasons.append("assunto contido no node")

    if subject_full_norm and subject_full_norm == candidate.full_norm:
        score += 160.0
        reasons.append("descricao completa igual")

    subassunto_subunit_coverage = _coverage(subassunto_tokens, candidate.subunidade_tokens)
    subassunto_full_coverage = _coverage(subassunto_tokens, candidate.full_tokens)
    assunto_materia_coverage = _coverage(assunto_tokens, candidate.materia_tokens)
    assunto_full_coverage = _coverage(assunto_tokens, candidate.full_tokens)

    score += subassunto_subunit_coverage * 95.0
    score += subassunto_full_coverage * 40.0
    score += assunto_materia_coverage * 45.0
    score += assunto_full_coverage * 20.0

    if subassunto_subunit_coverage >= 0.75:
        reasons.append("alta cobertura do subassunto na subunidade")
    elif subassunto_full_coverage >= 0.75:
        reasons.append("alta cobertura do subassunto no node")
    if assunto_materia_coverage >= 0.75:
        reasons.append("alta cobertura do assunto na materia")

    return score, ", ".join(reasons) or "sem sinal forte"


def _build_unmapped(
    subject: Subject,
    confidence_score: float,
    reason: str,
    relevant_candidate_count: int,
) -> SubjectRoadmapMapping:
    return SubjectRoadmapMapping(
        subject_id=subject.id or 0,
        discipline=subject.disciplina,
        roadmap_node_id=None,
        mapped=False,
        mapping_source="unmapped",
        confidence_score=round(confidence_score, 2),
        reason=reason,
        relevant_candidate_count=relevant_candidate_count,
    )


def build_subject_roadmap_mapping(
    session: Session,
    discipline_filter: str | None = None,
) -> dict[int, SubjectRoadmapMapping]:
    subjects = session.exec(select(Subject).where(Subject.ativo == True)).all()  # noqa: E712
    prepared_nodes = _prepare_nodes(session, discipline_filter=discipline_filter)
    overrides = _load_overrides(session)
    wanted = normalize_mapping_discipline(discipline_filter) if discipline_filter else None
    result: dict[int, SubjectRoadmapMapping] = {}

    for subject in subjects:
        if subject.id is None:
            continue
        discipline_key = normalize_mapping_discipline(subject.disciplina)
        if wanted is not None and discipline_key != wanted:
            continue

        override = overrides.get(subject.id)
        if override is not None:
            result[subject.id] = SubjectRoadmapMapping(
                subject_id=subject.id,
                discipline=subject.disciplina,
                roadmap_node_id=override.roadmap_node_id,
                mapped=True,
                mapping_source="override",
                confidence_score=999.0,
                reason=f"Mapeado por override manual. {override.notes}".strip(),
                relevant_candidate_count=1,
            )
            continue

        candidates = prepared_nodes.get(discipline_key, [])
        assunto_norm = _normalize_text(subject.assunto)
        subassunto_norm = _normalize_text(subject.subassunto)
        ranked: list[tuple[float, str, _PreparedNode]] = []
        for candidate in candidates:
            score, reason = _score_mapping(subject, candidate)
            if score > 0:
                ranked.append((score, reason, candidate))
        ranked.sort(key=lambda item: (-item[0], item[2].node.node_id))

        if not ranked:
            result[subject.id] = _build_unmapped(
                subject,
                confidence_score=0.0,
                reason="Sem correspondencia forte entre assunto/subassunto e node do roadmap.",
                relevant_candidate_count=0,
            )
            continue

        top_score, top_reason, top_candidate = ranked[0]
        second_score = ranked[1][0] if len(ranked) > 1 else 0.0
        relevant_candidate_count = sum(1 for score, _, _ in ranked if score >= max(70.0, top_score - 15.0))

        if top_score < 100.0:
            result[subject.id] = _build_unmapped(
                subject,
                confidence_score=top_score,
                reason="Correspondencia insuficiente para mapear com confianca.",
                relevant_candidate_count=relevant_candidate_count,
            )
            continue

        if second_score and top_score - second_score < 12.0:
            result[subject.id] = _build_unmapped(
                subject,
                confidence_score=top_score,
                reason="Mapeamento ambiguo entre multiplos nodes do roadmap.",
                relevant_candidate_count=relevant_candidate_count,
            )
            continue

        broad_bucket_match_count = sum(
            1
            for candidate in candidates
            if candidate.materia_norm
            and candidate.materia_norm in {assunto_norm, subassunto_norm}
        )
        if (
            subassunto_norm
            and subassunto_norm == assunto_norm
            and
            broad_bucket_match_count > 1
            and top_candidate.materia_norm in {assunto_norm, subassunto_norm}
            and top_candidate.subunidade_norm not in {assunto_norm, subassunto_norm}
            and top_candidate.conteudo_norm not in {assunto_norm, subassunto_norm}
        ):
            result[subject.id] = _build_unmapped(
                subject,
                confidence_score=top_score,
                reason="Mapeamento amplo demais para um unico subnode; mantido como ambiguo.",
                relevant_candidate_count=broad_bucket_match_count,
            )
            continue

        result[subject.id] = SubjectRoadmapMapping(
            subject_id=subject.id,
            discipline=subject.disciplina,
            roadmap_node_id=top_candidate.node.node_id,
            mapped=True,
            mapping_source="heuristic",
            confidence_score=round(top_score, 2),
            reason=f"Mapeado por heuristica v2: {top_reason}.",
            relevant_candidate_count=relevant_candidate_count,
        )

    return result


def summarize_subject_roadmap_mapping(mapping: dict[int, SubjectRoadmapMapping]) -> SubjectRoadmapMappingSummary:
    total = len(mapping)
    mapped = sum(1 for item in mapping.values() if item.mapped)
    override_mapped = sum(1 for item in mapping.values() if item.mapping_source == "override")
    heuristic_mapped = sum(1 for item in mapping.values() if item.mapping_source == "heuristic")
    return SubjectRoadmapMappingSummary(
        total_subjects=total,
        mapped_subjects=mapped,
        unmapped_subjects=total - mapped,
        override_mapped_subjects=override_mapped,
        heuristic_mapped_subjects=heuristic_mapped,
    )
