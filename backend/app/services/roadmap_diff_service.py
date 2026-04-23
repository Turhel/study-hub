from __future__ import annotations

from collections import defaultdict
from typing import Any, TypeAlias

from sqlmodel import Session, select

from app.db import get_session
from app.models import RoadmapBlockMap, RoadmapEdge, RoadmapNode, RoadmapRule
from app.schemas import RoadmapDryRunExamples, RoadmapDryRunResponse, RoadmapDryRunTypeSummary
from app.services.roadmap_import_service import (
    REQUIRED_BLOCK_MAP_COLUMNS,
    REQUIRED_EDGE_COLUMNS,
    REQUIRED_NODE_COLUMNS,
    REQUIRED_RULE_COLUMNS,
    _parse_bool,
    _parse_float,
    _parse_int,
    _read_csv,
)
from app.services.roadmap_validation_service import normalize_discipline


Payload: TypeAlias = dict[str, Any]
Key: TypeAlias = str | tuple[Any, ...]
DiffResult: TypeAlias = dict[str, list[Key]]

EXAMPLE_LIMIT = 10


def get_roadmap_dry_run(session: Session | None = None) -> RoadmapDryRunResponse:
    own_session = session is None
    db = session or get_session()
    try:
        csv_nodes = _load_csv_nodes()
        csv_edges = _load_csv_edges()
        csv_block_map = _load_csv_block_map()
        csv_rules = _load_csv_rules()

        db_nodes = {
            item.node_id: _node_payload(item)
            for item in db.exec(select(RoadmapNode))
        }
        db_edges = {
            (item.from_node_id, item.to_node_id, item.relation_type): _edge_payload(item)
            for item in db.exec(select(RoadmapEdge))
        }
        db_block_map = {
            (item.disciplina, item.block_number, item.node_id, item.role_in_block, item.sequence_in_block): _block_map_payload(
                item
            )
            for item in db.exec(select(RoadmapBlockMap))
        }
        db_rules = {
            item.rule_key: _rule_payload(item)
            for item in db.exec(select(RoadmapRule))
        }

        diffs = {
            "nodes": _diff_payloads(csv_nodes, db_nodes),
            "edges": _diff_payloads(csv_edges, db_edges),
            "block_map": _diff_payloads(csv_block_map, db_block_map),
            "rules": _diff_payloads(csv_rules, db_rules),
        }

        summary = _build_summary(diffs)
        types = {
            name: RoadmapDryRunTypeSummary(
                to_create=len(diff["to_create"]),
                to_update=len(diff["to_update"]),
                only_in_db=len(diff["only_in_db"]),
            )
            for name, diff in diffs.items()
        }
        by_discipline = _build_by_discipline(
            diffs=diffs,
            csv_nodes=csv_nodes,
            db_nodes=db_nodes,
            csv_edges=csv_edges,
            db_edges=db_edges,
            csv_block_map=csv_block_map,
            db_block_map=db_block_map,
        )

        return RoadmapDryRunResponse(
            summary=summary,
            types=types,
            by_discipline=by_discipline,
            examples=_build_examples(diffs),
        )
    finally:
        if own_session:
            db.close()


def _load_csv_nodes() -> dict[str, Payload]:
    rows = _read_csv("nodes.csv", REQUIRED_NODE_COLUMNS)
    nodes: dict[str, Payload] = {}
    for row in rows:
        node_id = row["node_id"]
        nodes[node_id] = {
            "node_id": node_id,
            "disciplina_estrategica": row["disciplina_estrategica"],
            "disciplina": row["disciplina"],
            "materia": row["materia"],
            "conteudo": row["conteudo"],
            "subunidade": row["subunidade"] or None,
            "descricao_curta": row["descricao_curta"] or None,
            "tamanho_pedagogico": row["tamanho_pedagogico"],
            "expected_contacts_min": _parse_int(row["expected_contacts_min"], "expected_contacts_min"),
            "expected_contacts_target": _parse_int(row["expected_contacts_target"], "expected_contacts_target"),
            "cadencia_base": row["cadencia_base"],
            "frequencia_base": row["frequencia_base"],
            "peso_recorrencia": _parse_float(row["peso_recorrencia"], "peso_recorrencia"),
            "peso_estrategico": _parse_float(row["peso_estrategico"], "peso_estrategico"),
            "tipo_no": row["tipo_no"],
            "free_mode": _parse_bool(row["free_mode"], "free_mode"),
            "ativo": _parse_bool(row["ativo"], "ativo"),
            "observacoes": row["observacoes"] or None,
        }
    return nodes


def _load_csv_edges() -> dict[tuple[str, str, str], Payload]:
    rows = _read_csv("edges.csv", REQUIRED_EDGE_COLUMNS)
    edges: dict[tuple[str, str, str], Payload] = {}
    for row in rows:
        key = (row["from_node_id"], row["to_node_id"], row["relation_type"])
        edges[key] = {
            "from_node_id": row["from_node_id"],
            "to_node_id": row["to_node_id"],
            "relation_type": row["relation_type"],
            "strength": _parse_float(row["strength"], "strength"),
            "notes": row["notes"] or None,
        }
    return edges


def _load_csv_block_map() -> dict[tuple[str, int, str, str, int], Payload]:
    rows = _read_csv("block_map.csv", REQUIRED_BLOCK_MAP_COLUMNS)
    block_map: dict[tuple[str, int, str, str, int], Payload] = {}
    for row in rows:
        block_number = _parse_int(row["block_number"], "block_number")
        sequence_in_block = _parse_int(row["sequence_in_block"], "sequence_in_block")
        key = (row["disciplina"], block_number, row["node_id"], row["role_in_block"], sequence_in_block)
        block_map[key] = {
            "disciplina": row["disciplina"],
            "block_number": block_number,
            "node_id": row["node_id"],
            "role_in_block": row["role_in_block"],
            "sequence_in_block": sequence_in_block,
        }
    return block_map


def _load_csv_rules() -> dict[str, Payload]:
    rows = _read_csv("rules.csv", REQUIRED_RULE_COLUMNS)
    rules: dict[str, Payload] = {}
    for row in rows:
        rules[row["rule_key"]] = {
            "rule_key": row["rule_key"],
            "rule_value": row["rule_value"],
            "notes": row["notes"] or None,
        }
    return rules


def _node_payload(item: RoadmapNode) -> Payload:
    return {
        "node_id": item.node_id,
        "disciplina_estrategica": item.disciplina_estrategica,
        "disciplina": item.disciplina,
        "materia": item.materia,
        "conteudo": item.conteudo,
        "subunidade": item.subunidade,
        "descricao_curta": item.descricao_curta,
        "tamanho_pedagogico": item.tamanho_pedagogico,
        "expected_contacts_min": item.expected_contacts_min,
        "expected_contacts_target": item.expected_contacts_target,
        "cadencia_base": item.cadencia_base,
        "frequencia_base": item.frequencia_base,
        "peso_recorrencia": item.peso_recorrencia,
        "peso_estrategico": item.peso_estrategico,
        "tipo_no": item.tipo_no,
        "free_mode": item.free_mode,
        "ativo": item.ativo,
        "observacoes": item.observacoes,
    }


def _edge_payload(item: RoadmapEdge) -> Payload:
    return {
        "from_node_id": item.from_node_id,
        "to_node_id": item.to_node_id,
        "relation_type": item.relation_type,
        "strength": item.strength,
        "notes": item.notes,
    }


def _block_map_payload(item: RoadmapBlockMap) -> Payload:
    return {
        "disciplina": item.disciplina,
        "block_number": item.block_number,
        "node_id": item.node_id,
        "role_in_block": item.role_in_block,
        "sequence_in_block": item.sequence_in_block,
    }


def _rule_payload(item: RoadmapRule) -> Payload:
    return {
        "rule_key": item.rule_key,
        "rule_value": item.rule_value,
        "notes": item.notes,
    }


def _diff_payloads(csv_items: dict[Key, Payload], db_items: dict[Key, Payload]) -> DiffResult:
    csv_keys = set(csv_items)
    db_keys = set(db_items)
    shared_keys = csv_keys & db_keys
    return {
        "to_create": sorted(csv_keys - db_keys, key=_sort_key),
        "to_update": sorted(
            (key for key in shared_keys if csv_items[key] != db_items[key]),
            key=_sort_key,
        ),
        "only_in_db": sorted(db_keys - csv_keys, key=_sort_key),
    }


def _build_summary(diffs: dict[str, DiffResult]) -> dict[str, int]:
    summary: dict[str, int] = {}
    for name, diff in diffs.items():
        prefix = name
        summary[f"{prefix}_to_create"] = len(diff["to_create"])
        summary[f"{prefix}_to_update"] = len(diff["to_update"])
        summary[f"{prefix}_only_in_db"] = len(diff["only_in_db"])
    return summary


def _build_by_discipline(
    *,
    diffs: dict[str, DiffResult],
    csv_nodes: dict[str, Payload],
    db_nodes: dict[str, Payload],
    csv_edges: dict[tuple[str, str, str], Payload],
    db_edges: dict[tuple[str, str, str], Payload],
    csv_block_map: dict[tuple[str, int, str, str, int], Payload],
    db_block_map: dict[tuple[str, int, str, str, int], Payload],
) -> dict[str, dict[str, int]]:
    counters: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    _count_keys_by_discipline(counters, diffs["nodes"]["to_create"], "nodes_to_create", csv_nodes)
    _count_keys_by_discipline(counters, diffs["nodes"]["to_update"], "nodes_to_update", csv_nodes)
    _count_keys_by_discipline(counters, diffs["nodes"]["only_in_db"], "nodes_only_in_db", db_nodes)

    _count_edge_keys_by_discipline(counters, diffs["edges"]["to_create"], "edges_to_create", csv_edges, csv_nodes)
    _count_edge_keys_by_discipline(counters, diffs["edges"]["to_update"], "edges_to_update", csv_edges, csv_nodes)
    _count_edge_keys_by_discipline(counters, diffs["edges"]["only_in_db"], "edges_only_in_db", db_edges, db_nodes)

    _count_keys_by_discipline(
        counters,
        diffs["block_map"]["to_create"],
        "block_map_to_create",
        csv_block_map,
        discipline_field="disciplina",
    )
    _count_keys_by_discipline(
        counters,
        diffs["block_map"]["to_update"],
        "block_map_to_update",
        csv_block_map,
        discipline_field="disciplina",
    )
    _count_keys_by_discipline(
        counters,
        diffs["block_map"]["only_in_db"],
        "block_map_only_in_db",
        db_block_map,
        discipline_field="disciplina",
    )

    return {
        discipline: dict(values)
        for discipline, values in sorted(counters.items(), key=lambda item: normalize_discipline(item[0]))
    }


def _count_keys_by_discipline(
    counters: dict[str, dict[str, int]],
    keys: list[Key],
    field_name: str,
    payloads: dict[Key, Payload],
    discipline_field: str = "disciplina",
) -> None:
    for key in keys:
        discipline = payloads[key].get(discipline_field)
        if discipline:
            counters[str(discipline)][field_name] += 1


def _count_edge_keys_by_discipline(
    counters: dict[str, dict[str, int]],
    keys: list[Key],
    field_name: str,
    edge_payloads: dict[Key, Payload],
    node_payloads: dict[str, Payload],
) -> None:
    for key in keys:
        edge = edge_payloads[key]
        from_node_id = edge["from_node_id"]
        discipline = node_payloads.get(from_node_id, {}).get("disciplina")
        if discipline:
            counters[str(discipline)][field_name] += 1


def _build_examples(diffs: dict[str, DiffResult]) -> RoadmapDryRunExamples:
    return RoadmapDryRunExamples(
        nodes_to_create=_format_examples(diffs["nodes"]["to_create"]),
        nodes_to_update=_format_examples(diffs["nodes"]["to_update"]),
        nodes_only_in_db=_format_examples(diffs["nodes"]["only_in_db"]),
        edges_to_create=_format_examples(diffs["edges"]["to_create"]),
        edges_to_update=_format_examples(diffs["edges"]["to_update"]),
        edges_only_in_db=_format_examples(diffs["edges"]["only_in_db"]),
        block_map_to_create=_format_examples(diffs["block_map"]["to_create"]),
        block_map_to_update=_format_examples(diffs["block_map"]["to_update"]),
        block_map_only_in_db=_format_examples(diffs["block_map"]["only_in_db"]),
        rules_to_create=_format_examples(diffs["rules"]["to_create"]),
        rules_to_update=_format_examples(diffs["rules"]["to_update"]),
        rules_only_in_db=_format_examples(diffs["rules"]["only_in_db"]),
    )


def _format_examples(keys: list[Key]) -> list[str]:
    return [_format_key(key) for key in keys[:EXAMPLE_LIMIT]]


def _format_key(key: Key) -> str:
    if isinstance(key, tuple):
        return " | ".join(str(part) for part in key)
    return str(key)


def _sort_key(key: Key) -> tuple[str, ...]:
    if isinstance(key, tuple):
        return tuple(str(part) for part in key)
    return (str(key),)
