from __future__ import annotations

import csv
import unicodedata
from collections import defaultdict
from pathlib import Path

from app.schemas import RoadmapValidationIssue, RoadmapValidationResponse


VALID_PEDAGOGICAL_SIZES = {"micro", "pequeno", "medio", "grande", "continuo"}
VALID_NODE_TYPES = {"content", "skill", "block_entry", "continuous"}
VALID_BOOL_VALUES = {"1", "0", "true", "false", "sim", "nao", "não", "yes", "no"}
VALID_RELATION_TYPES = {"required", "recommended", "cross_required", "cross_support"}
VALID_BLOCK_ROLES = {"core", "review", "transition", "support"}

REQUIRED_NODE_COLUMNS = {
    "node_id",
    "disciplina_estrategica",
    "disciplina",
    "materia",
    "conteudo",
    "subunidade",
    "descricao_curta",
    "tamanho_pedagogico",
    "expected_contacts_min",
    "expected_contacts_target",
    "cadencia_base",
    "frequencia_base",
    "peso_recorrencia",
    "peso_estrategico",
    "tipo_no",
    "free_mode",
    "ativo",
    "observacoes",
}
REQUIRED_EDGE_COLUMNS = {"from_node_id", "to_node_id", "relation_type", "strength", "notes"}
REQUIRED_BLOCK_MAP_COLUMNS = {"disciplina", "block_number", "node_id", "role_in_block", "sequence_in_block"}
REQUIRED_RULE_COLUMNS = {"rule_key", "rule_value", "notes"}

ESSENTIAL_NODE_FIELDS = {
    "node_id",
    "disciplina_estrategica",
    "disciplina",
    "materia",
    "conteudo",
    "tamanho_pedagogico",
    "expected_contacts_min",
    "expected_contacts_target",
    "cadencia_base",
    "frequencia_base",
    "peso_recorrencia",
    "peso_estrategico",
    "tipo_no",
    "free_mode",
    "ativo",
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def roadmap_dir() -> Path:
    return repo_root() / "docs" / "roadmap"


def normalize_discipline(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip())
    ascii_only = "".join(char for char in normalized if not unicodedata.combining(char))
    return ascii_only.casefold()


def _issue(
    severity: str,
    file: str,
    code: str,
    message: str,
    row: int | None = None,
    node_id: str | None = None,
) -> RoadmapValidationIssue:
    return RoadmapValidationIssue(
        severity=severity,  # type: ignore[arg-type]
        file=file,
        row=row,
        code=code,
        message=message,
        node_id=node_id,
    )


def _read_csv_for_validation(
    filename: str,
    required_columns: set[str],
    issues: list[RoadmapValidationIssue],
) -> list[dict[str, str]]:
    path = (roadmap_dir() / filename).resolve()
    if not path.exists():
        issues.append(_issue("error", filename, "file_missing", f"Arquivo nao encontrado: {path}"))
        return []

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = set(reader.fieldnames or [])
        missing = required_columns - fieldnames
        if missing:
            issues.append(
                _issue(
                    "error",
                    filename,
                    "missing_columns",
                    f"Colunas obrigatorias ausentes: {', '.join(sorted(missing))}",
                )
            )
        rows: list[dict[str, str]] = []
        for index, row in enumerate(reader, start=2):
            if None in row:
                issues.append(
                    _issue(
                        "error",
                        filename,
                        "malformed_row",
                        "Linha tem colunas sobrando. Use aspas quando houver virgula dentro de um campo.",
                        row=index,
                    )
                )
            rows.append({key: (value or "").strip() for key, value in row.items() if key is not None})
        return rows


def _parse_positive_int(value: str) -> int | None:
    try:
        parsed = int(value)
    except ValueError:
        return None
    return parsed if parsed >= 1 else None


def _parse_non_negative_int(value: str) -> int | None:
    try:
        parsed = int(value)
    except ValueError:
        return None
    return parsed if parsed >= 0 else None


def _parse_float(value: str) -> float | None:
    try:
        return float(value)
    except ValueError:
        return None


def _validate_nodes(rows: list[dict[str, str]], issues: list[RoadmapValidationIssue]) -> dict[str, dict[str, str]]:
    nodes: dict[str, dict[str, str]] = {}
    seen: dict[str, int] = {}
    for index, row in enumerate(rows, start=2):
        node_id = row.get("node_id", "")
        for field_name in ESSENTIAL_NODE_FIELDS:
            if not row.get(field_name, ""):
                issues.append(
                    _issue(
                        "error",
                        "nodes.csv",
                        "empty_required_field",
                        f"Campo essencial vazio: {field_name}",
                        row=index,
                        node_id=node_id or None,
                    )
                )

        if node_id:
            if node_id in seen:
                issues.append(
                    _issue(
                        "error",
                        "nodes.csv",
                        "duplicate_node_id",
                        f"node_id duplicado. Primeira ocorrencia na linha {seen[node_id]}.",
                        row=index,
                        node_id=node_id,
                    )
                )
            else:
                seen[node_id] = index
                nodes[node_id] = row

        size = row.get("tamanho_pedagogico", "")
        if size and size not in VALID_PEDAGOGICAL_SIZES:
            issues.append(
                _issue(
                    "error",
                    "nodes.csv",
                    "invalid_pedagogical_size",
                    f"tamanho_pedagogico invalido: {size}",
                    row=index,
                    node_id=node_id or None,
                )
            )

        node_type = row.get("tipo_no", "")
        if node_type and node_type not in VALID_NODE_TYPES:
            issues.append(
                _issue(
                    "error",
                    "nodes.csv",
                    "invalid_node_type",
                    f"tipo_no invalido: {node_type}",
                    row=index,
                    node_id=node_id or None,
                )
            )

        for bool_field in ("free_mode", "ativo"):
            value = row.get(bool_field, "").casefold()
            if value and value not in VALID_BOOL_VALUES:
                issues.append(
                    _issue(
                        "error",
                        "nodes.csv",
                        "invalid_bool",
                        f"{bool_field} invalido: {row.get(bool_field, '')}",
                        row=index,
                        node_id=node_id or None,
                    )
                )

        for int_field in ("expected_contacts_min", "expected_contacts_target"):
            value = row.get(int_field, "")
            if value and _parse_non_negative_int(value) is None:
                issues.append(
                    _issue(
                        "error",
                        "nodes.csv",
                        "invalid_integer",
                        f"{int_field} deve ser inteiro maior ou igual a zero: {value}",
                        row=index,
                        node_id=node_id or None,
                    )
                )

        min_contacts = _parse_non_negative_int(row.get("expected_contacts_min", ""))
        target_contacts = _parse_non_negative_int(row.get("expected_contacts_target", ""))
        if min_contacts is not None and target_contacts is not None and target_contacts < min_contacts:
            issues.append(
                _issue(
                    "warning",
                    "nodes.csv",
                    "contacts_target_below_min",
                    "expected_contacts_target esta menor que expected_contacts_min.",
                    row=index,
                    node_id=node_id or None,
                )
            )

        for float_field in ("peso_recorrencia", "peso_estrategico"):
            value = row.get(float_field, "")
            if value and _parse_float(value) is None:
                issues.append(
                    _issue(
                        "error",
                        "nodes.csv",
                        "invalid_number",
                        f"{float_field} deve ser numerico: {value}",
                        row=index,
                        node_id=node_id or None,
                    )
                )

    return nodes


def _validate_edges(
    rows: list[dict[str, str]],
    nodes: dict[str, dict[str, str]],
    issues: list[RoadmapValidationIssue],
) -> list[tuple[str, str, str]]:
    edges: list[tuple[str, str, str]] = []
    seen_triples: dict[tuple[str, str, str], int] = {}
    seen_pairs: dict[tuple[str, str], int] = {}
    for index, row in enumerate(rows, start=2):
        from_node_id = row.get("from_node_id", "")
        to_node_id = row.get("to_node_id", "")
        relation_type = row.get("relation_type", "")
        node_for_issue = from_node_id or to_node_id or None

        for field_name in REQUIRED_EDGE_COLUMNS - {"notes"}:
            if not row.get(field_name, ""):
                issues.append(
                    _issue(
                        "error",
                        "edges.csv",
                        "empty_required_field",
                        f"Campo obrigatorio vazio: {field_name}",
                        row=index,
                        node_id=node_for_issue,
                    )
                )

        if from_node_id and from_node_id not in nodes:
            issues.append(
                _issue(
                    "error",
                    "edges.csv",
                    "unknown_from_node",
                    f"from_node_id nao existe em nodes.csv: {from_node_id}",
                    row=index,
                    node_id=from_node_id,
                )
            )
        if to_node_id and to_node_id not in nodes:
            issues.append(
                _issue(
                    "error",
                    "edges.csv",
                    "unknown_to_node",
                    f"to_node_id nao existe em nodes.csv: {to_node_id}",
                    row=index,
                    node_id=to_node_id,
                )
            )
        if from_node_id and to_node_id and from_node_id == to_node_id:
            issues.append(
                _issue(
                    "error",
                    "edges.csv",
                    "self_reference",
                    "Aresta aponta para o proprio node.",
                    row=index,
                    node_id=from_node_id,
                )
            )
        if relation_type and relation_type not in VALID_RELATION_TYPES:
            issues.append(
                _issue(
                    "error",
                    "edges.csv",
                    "invalid_relation_type",
                    f"relation_type invalido: {relation_type}",
                    row=index,
                    node_id=node_for_issue,
                )
            )

        strength = _parse_float(row.get("strength", ""))
        if row.get("strength", "") and (strength is None or strength < 1 or strength > 3):
            issues.append(
                _issue(
                    "error",
                    "edges.csv",
                    "invalid_strength",
                    f"strength deve ser numerico entre 1 e 3: {row.get('strength', '')}",
                    row=index,
                    node_id=node_for_issue,
                )
            )

        if from_node_id and to_node_id and relation_type:
            triple = (from_node_id, to_node_id, relation_type)
            pair = (from_node_id, to_node_id)
            duplicate_triple = triple in seen_triples
            pair_seen = pair in seen_pairs
            if duplicate_triple:
                issues.append(
                    _issue(
                        "error",
                        "edges.csv",
                        "duplicate_edge",
                        f"Aresta duplicada. Primeira ocorrencia na linha {seen_triples[triple]}.",
                        row=index,
                        node_id=from_node_id,
                    )
                )
            else:
                seen_triples[triple] = index
                edges.append(triple)

            if pair_seen and not duplicate_triple:
                issues.append(
                    _issue(
                        "warning",
                        "edges.csv",
                        "duplicate_edge_pair",
                        f"Mesmo par from/to apareceu antes na linha {seen_pairs[pair]} com outro tipo de relacao.",
                        row=index,
                        node_id=from_node_id,
                    )
                )
            else:
                seen_pairs.setdefault(pair, index)

    return edges


def _validate_block_map(
    rows: list[dict[str, str]],
    nodes: dict[str, dict[str, str]],
    issues: list[RoadmapValidationIssue],
) -> list[dict[str, str]]:
    valid_rows: list[dict[str, str]] = []
    seen_sequence: dict[tuple[str, int, int], int] = {}
    seen_mapping: dict[tuple[str, int, str], int] = {}
    for index, row in enumerate(rows, start=2):
        discipline = row.get("disciplina", "")
        node_id = row.get("node_id", "")
        role = row.get("role_in_block", "")

        for field_name in REQUIRED_BLOCK_MAP_COLUMNS:
            if not row.get(field_name, ""):
                issues.append(
                    _issue(
                        "error",
                        "block_map.csv",
                        "empty_required_field",
                        f"Campo obrigatorio vazio: {field_name}",
                        row=index,
                        node_id=node_id or None,
                    )
                )

        block_number = _parse_positive_int(row.get("block_number", ""))
        sequence = _parse_positive_int(row.get("sequence_in_block", ""))
        if row.get("block_number", "") and block_number is None:
            issues.append(
                _issue(
                    "error",
                    "block_map.csv",
                    "invalid_block_number",
                    f"block_number deve ser inteiro positivo: {row.get('block_number', '')}",
                    row=index,
                    node_id=node_id or None,
                )
            )
        if row.get("sequence_in_block", "") and sequence is None:
            issues.append(
                _issue(
                    "error",
                    "block_map.csv",
                    "invalid_sequence_in_block",
                    f"sequence_in_block deve ser inteiro positivo: {row.get('sequence_in_block', '')}",
                    row=index,
                    node_id=node_id or None,
                )
            )

        if node_id and node_id not in nodes:
            issues.append(
                _issue(
                    "error",
                    "block_map.csv",
                    "unknown_node",
                    f"node_id nao existe em nodes.csv: {node_id}",
                    row=index,
                    node_id=node_id,
                )
            )
        if role and role not in VALID_BLOCK_ROLES:
            issues.append(
                _issue(
                    "error",
                    "block_map.csv",
                    "invalid_role_in_block",
                    f"role_in_block invalido: {role}",
                    row=index,
                    node_id=node_id or None,
                )
            )

        if node_id in nodes and discipline:
            node_discipline = nodes[node_id].get("disciplina", "")
            if normalize_discipline(node_discipline) != normalize_discipline(discipline):
                issues.append(
                    _issue(
                        "error",
                        "block_map.csv",
                        "discipline_mismatch",
                        f"Disciplina divergente para {node_id}: block_map={discipline}, nodes={node_discipline}",
                        row=index,
                        node_id=node_id,
                    )
                )

        if discipline and block_number is not None and sequence is not None:
            sequence_key = (normalize_discipline(discipline), block_number, sequence)
            if sequence_key in seen_sequence:
                issues.append(
                    _issue(
                        "error",
                        "block_map.csv",
                        "duplicate_block_sequence",
                        f"Sequencia duplicada no mesmo bloco/disciplina. Primeira ocorrencia na linha {seen_sequence[sequence_key]}.",
                        row=index,
                        node_id=node_id or None,
                    )
                )
            else:
                seen_sequence[sequence_key] = index

        if discipline and block_number is not None and node_id:
            mapping_key = (normalize_discipline(discipline), block_number, node_id)
            if mapping_key in seen_mapping:
                issues.append(
                    _issue(
                        "warning",
                        "block_map.csv",
                        "duplicate_block_node",
                        f"Mesmo node repetido no mesmo bloco/disciplina. Primeira ocorrencia na linha {seen_mapping[mapping_key]}.",
                        row=index,
                        node_id=node_id,
                    )
                )
            else:
                seen_mapping[mapping_key] = index

        if block_number is not None and sequence is not None:
            valid_rows.append(row)

    return valid_rows


def _validate_rules(rows: list[dict[str, str]], issues: list[RoadmapValidationIssue]) -> None:
    seen: dict[str, int] = {}
    for index, row in enumerate(rows, start=2):
        rule_key = row.get("rule_key", "")
        rule_value = row.get("rule_value", "")
        if not rule_key:
            issues.append(_issue("error", "rules.csv", "empty_rule_key", "rule_key vazio.", row=index))
        elif rule_key in seen:
            issues.append(
                _issue(
                    "error",
                    "rules.csv",
                    "duplicate_rule_key",
                    f"rule_key duplicado. Primeira ocorrencia na linha {seen[rule_key]}.",
                    row=index,
                )
            )
        else:
            seen[rule_key] = index

        if not rule_value:
            issues.append(
                _issue(
                    "error",
                    "rules.csv",
                    "empty_rule_value",
                    f"rule_value vazio para rule_key={rule_key or '<vazio>'}.",
                    row=index,
                )
            )


def _find_cycles(edges: list[tuple[str, str, str]]) -> list[list[str]]:
    graph: dict[str, list[str]] = defaultdict(list)
    for from_node_id, to_node_id, relation_type in edges:
        if relation_type in {"required", "cross_required"}:
            graph[from_node_id].append(to_node_id)

    visited: set[str] = set()
    in_stack: set[str] = set()
    stack: list[str] = []
    cycles: list[list[str]] = []
    cycle_keys: set[tuple[str, ...]] = set()

    def visit(node_id: str) -> None:
        visited.add(node_id)
        in_stack.add(node_id)
        stack.append(node_id)
        for next_node_id in graph.get(node_id, []):
            if next_node_id not in visited:
                visit(next_node_id)
            elif next_node_id in in_stack:
                start = stack.index(next_node_id)
                cycle = stack[start:] + [next_node_id]
                key = tuple(sorted(set(cycle)))
                if key not in cycle_keys:
                    cycle_keys.add(key)
                    cycles.append(cycle)
        stack.pop()
        in_stack.remove(node_id)

    for node_id in sorted(graph):
        if node_id not in visited:
            visit(node_id)

    return cycles


def _run_audits(
    nodes: dict[str, dict[str, str]],
    edges: list[tuple[str, str, str]],
    block_map_rows: list[dict[str, str]],
    issues: list[RoadmapValidationIssue],
) -> None:
    mapped_nodes = {row.get("node_id", "") for row in block_map_rows if row.get("node_id", "")}
    from_nodes = {from_node_id for from_node_id, _, _ in edges}
    to_nodes = {to_node_id for _, to_node_id, _ in edges}
    edge_nodes = from_nodes | to_nodes

    for node_id in sorted(set(nodes) - mapped_nodes):
        issues.append(
            _issue(
                "warning",
                "block_map.csv",
                "node_without_block_map",
                "Node existe em nodes.csv, mas nao aparece em block_map.csv.",
                node_id=node_id,
            )
        )

    for node_id in sorted(set(nodes) - edge_nodes):
        issues.append(
            _issue(
                "warning",
                "edges.csv",
                "node_without_edges",
                "Node nao tem arestas de entrada nem de saida.",
                node_id=node_id,
            )
        )

    for cycle in _find_cycles(edges):
        issues.append(
            _issue(
                "error",
                "edges.csv",
                "required_dependency_cycle",
                f"Ciclo em dependencias required/cross_required: {' -> '.join(cycle)}",
                node_id=cycle[0] if cycle else None,
            )
        )

    for from_node_id, to_node_id, relation_type in edges:
        if from_node_id not in nodes or to_node_id not in nodes:
            continue
        from_discipline = normalize_discipline(nodes[from_node_id].get("disciplina", ""))
        to_discipline = normalize_discipline(nodes[to_node_id].get("disciplina", ""))
        is_cross_relation = relation_type in {"cross_required", "cross_support"}
        is_cross_discipline = from_discipline != to_discipline
        if is_cross_relation and not is_cross_discipline:
            issues.append(
                _issue(
                    "warning",
                    "edges.csv",
                    "cross_relation_same_discipline",
                    f"{relation_type} liga nodes da mesma disciplina.",
                    node_id=from_node_id,
                )
            )
        if is_cross_discipline and not is_cross_relation:
            issues.append(
                _issue(
                    "warning",
                    "edges.csv",
                    "non_cross_relation_between_disciplines",
                    f"{relation_type} liga disciplinas diferentes; talvez devesse ser cross_*.",
                    node_id=from_node_id,
                )
            )

    blocks_by_discipline: dict[str, set[int]] = defaultdict(set)
    discipline_labels: dict[str, str] = {}
    for row in block_map_rows:
        discipline = row.get("disciplina", "")
        block_number = _parse_positive_int(row.get("block_number", ""))
        if not discipline or block_number is None:
            continue
        key = normalize_discipline(discipline)
        discipline_labels.setdefault(key, discipline)
        blocks_by_discipline[key].add(block_number)

    for discipline_key, blocks in blocks_by_discipline.items():
        if not blocks:
            continue
        for block_number in range(min(blocks), max(blocks) + 1):
            if block_number not in blocks:
                issues.append(
                    _issue(
                        "warning",
                        "block_map.csv",
                        "empty_or_missing_block",
                        f"Bloco {block_number} nao aparece entre os blocos mapeados de {discipline_labels[discipline_key]}.",
                    )
                )


def validate_roadmap_csvs() -> RoadmapValidationResponse:
    issues: list[RoadmapValidationIssue] = []
    nodes_rows = _read_csv_for_validation("nodes.csv", REQUIRED_NODE_COLUMNS, issues)
    edges_rows = _read_csv_for_validation("edges.csv", REQUIRED_EDGE_COLUMNS, issues)
    block_map_rows = _read_csv_for_validation("block_map.csv", REQUIRED_BLOCK_MAP_COLUMNS, issues)
    rules_rows = _read_csv_for_validation("rules.csv", REQUIRED_RULE_COLUMNS, issues)

    nodes = _validate_nodes(nodes_rows, issues)
    edges = _validate_edges(edges_rows, nodes, issues)
    valid_block_map_rows = _validate_block_map(block_map_rows, nodes, issues)
    _validate_rules(rules_rows, issues)
    _run_audits(nodes, edges, valid_block_map_rows, issues)

    errors = [issue for issue in issues if issue.severity == "error"]
    warnings = [issue for issue in issues if issue.severity == "warning"]
    return RoadmapValidationResponse(
        is_valid=not errors,
        errors_count=len(errors),
        warnings_count=len(warnings),
        errors=errors,
        warnings=warnings,
    )
