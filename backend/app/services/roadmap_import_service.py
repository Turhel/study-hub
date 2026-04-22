from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import TYPE_CHECKING

from app.schemas import RoadmapImportSummary
from app.services.roadmap_validation_service import normalize_discipline, validate_roadmap_csvs

if TYPE_CHECKING:
    from sqlmodel import Session


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


class RoadmapImportError(ValueError):
    pass


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _roadmap_dir() -> Path:
    return _repo_root() / "docs" / "roadmap"


def _read_csv(filename: str, required_columns: set[str]) -> list[dict[str, str]]:
    path = (_roadmap_dir() / filename).resolve()
    if not path.exists():
        raise RoadmapImportError(f"Arquivo de roadmap nao encontrado: {path}")

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = set(reader.fieldnames or [])
        missing = required_columns - fieldnames
        if missing:
            missing_sorted = ", ".join(sorted(missing))
            raise RoadmapImportError(f"{filename} sem colunas obrigatorias: {missing_sorted}")
        rows: list[dict[str, str]] = []
        for index, row in enumerate(reader, start=2):
            if None in row:
                raise RoadmapImportError(
                    f"{filename} tem colunas sobrando na linha {index}. Use aspas quando houver virgula dentro de um campo."
                )
            rows.append({key: (value or "").strip() for key, value in row.items()})
        return rows


def _parse_bool(value: str, field_name: str) -> bool:
    normalized = value.strip().casefold()
    if normalized in {"1", "true", "sim", "yes"}:
        return True
    if normalized in {"0", "false", "nao", "não", "no"}:
        return False
    raise RoadmapImportError(f"Valor booleano invalido em {field_name}: {value}")


def _parse_int(value: str, field_name: str) -> int:
    try:
        return int(value)
    except ValueError as exc:
        raise RoadmapImportError(f"Valor inteiro invalido em {field_name}: {value}") from exc


def _parse_float(value: str, field_name: str) -> float:
    try:
        return float(value)
    except ValueError as exc:
        raise RoadmapImportError(f"Valor numerico invalido em {field_name}: {value}") from exc


def import_roadmap_from_csv(session: "Session | None" = None) -> RoadmapImportSummary:
    from sqlmodel import select

    from app.db import get_session
    from app.models import RoadmapBlockMap, RoadmapEdge, RoadmapNode, RoadmapRule

    own_session = session is None
    db = session or get_session()
    try:
        nodes_rows = _read_csv("nodes.csv", REQUIRED_NODE_COLUMNS)
        edges_rows = _read_csv("edges.csv", REQUIRED_EDGE_COLUMNS)
        block_map_rows = _read_csv("block_map.csv", REQUIRED_BLOCK_MAP_COLUMNS)
        rules_rows = _read_csv("rules.csv", REQUIRED_RULE_COLUMNS)

        summary = RoadmapImportSummary(disciplines_detected=[])

        existing_nodes = {item.node_id: item for item in db.exec(select(RoadmapNode))}
        existing_edges = {
            (item.from_node_id, item.to_node_id, item.relation_type): item for item in db.exec(select(RoadmapEdge))
        }
        existing_block_map = {
            (item.disciplina, item.block_number, item.node_id): item for item in db.exec(select(RoadmapBlockMap))
        }
        existing_rules = {item.rule_key: item for item in db.exec(select(RoadmapRule))}

        disciplines: set[str] = set()

        for row in nodes_rows:
            node_id = row["node_id"]
            if not node_id:
                raise RoadmapImportError("nodes.csv contem node_id vazio.")

            payload = dict(
                node_id=node_id,
                disciplina_estrategica=row["disciplina_estrategica"],
                disciplina=row["disciplina"],
                materia=row["materia"],
                conteudo=row["conteudo"],
                subunidade=row["subunidade"] or None,
                descricao_curta=row["descricao_curta"] or None,
                tamanho_pedagogico=row["tamanho_pedagogico"],
                expected_contacts_min=_parse_int(row["expected_contacts_min"], "expected_contacts_min"),
                expected_contacts_target=_parse_int(row["expected_contacts_target"], "expected_contacts_target"),
                cadencia_base=row["cadencia_base"],
                frequencia_base=row["frequencia_base"],
                peso_recorrencia=_parse_float(row["peso_recorrencia"], "peso_recorrencia"),
                peso_estrategico=_parse_float(row["peso_estrategico"], "peso_estrategico"),
                tipo_no=row["tipo_no"],
                free_mode=_parse_bool(row["free_mode"], "free_mode"),
                ativo=_parse_bool(row["ativo"], "ativo"),
                observacoes=row["observacoes"] or None,
            )

            node = existing_nodes.get(node_id)
            if node is None:
                node = RoadmapNode(**payload)
                db.add(node)
                existing_nodes[node_id] = node
                summary.nodes_created += 1
            else:
                for key, value in payload.items():
                    setattr(node, key, value)
                db.add(node)
                summary.nodes_updated += 1

            disciplines.add(row["disciplina"])

        for row in edges_rows:
            relation_type = row["relation_type"]
            if relation_type not in VALID_RELATION_TYPES:
                raise RoadmapImportError(f"relation_type invalido em edges.csv: {relation_type}")
            if row["from_node_id"] not in existing_nodes or row["to_node_id"] not in existing_nodes:
                raise RoadmapImportError(
                    f"edges.csv referencia node inexistente: {row['from_node_id']} -> {row['to_node_id']}"
                )

            payload = dict(
                from_node_id=row["from_node_id"],
                to_node_id=row["to_node_id"],
                relation_type=relation_type,
                strength=_parse_float(row["strength"], "strength"),
                notes=row["notes"] or None,
            )
            key = (payload["from_node_id"], payload["to_node_id"], payload["relation_type"])
            edge = existing_edges.get(key)
            if edge is None:
                edge = RoadmapEdge(**payload)
                db.add(edge)
                existing_edges[key] = edge
                summary.edges_created += 1
            else:
                for field_name, value in payload.items():
                    setattr(edge, field_name, value)
                db.add(edge)
                summary.edges_updated += 1

        for row in block_map_rows:
            role_in_block = row["role_in_block"]
            if role_in_block not in VALID_BLOCK_ROLES:
                raise RoadmapImportError(f"role_in_block invalido em block_map.csv: {role_in_block}")
            if row["node_id"] not in existing_nodes:
                raise RoadmapImportError(f"block_map.csv referencia node inexistente: {row['node_id']}")

            discipline = row["disciplina"]
            mapped_node = existing_nodes[row["node_id"]]
            if normalize_discipline(mapped_node.disciplina) != normalize_discipline(discipline):
                raise RoadmapImportError(
                    f"block_map.csv tem disciplina divergente para node {row['node_id']}: {discipline}"
                )

            payload = dict(
                disciplina=discipline,
                block_number=_parse_int(row["block_number"], "block_number"),
                node_id=row["node_id"],
                role_in_block=role_in_block,
                sequence_in_block=_parse_int(row["sequence_in_block"], "sequence_in_block"),
            )
            key = (payload["disciplina"], payload["block_number"], payload["node_id"])
            item = existing_block_map.get(key)
            if item is None:
                item = RoadmapBlockMap(**payload)
                db.add(item)
                existing_block_map[key] = item
                summary.block_map_created += 1
            else:
                for field_name, value in payload.items():
                    setattr(item, field_name, value)
                db.add(item)
                summary.block_map_updated += 1

        for row in rules_rows:
            rule_key = row["rule_key"]
            if not rule_key:
                raise RoadmapImportError("rules.csv contem rule_key vazio.")
            payload = dict(rule_key=rule_key, rule_value=row["rule_value"], notes=row["notes"] or None)
            rule = existing_rules.get(rule_key)
            if rule is None:
                rule = RoadmapRule(**payload)
                db.add(rule)
                existing_rules[rule_key] = rule
                summary.rules_created += 1
            else:
                for field_name, value in payload.items():
                    setattr(rule, field_name, value)
                db.add(rule)
                summary.rules_updated += 1

        expected_node_ids = {row["node_id"] for row in nodes_rows}
        expected_edge_keys = {
            (row["from_node_id"], row["to_node_id"], row["relation_type"])
            for row in edges_rows
        }
        expected_block_map_keys = {
            (row["disciplina"], _parse_int(row["block_number"], "block_number"), row["node_id"])
            for row in block_map_rows
        }
        expected_rule_keys = {row["rule_key"] for row in rules_rows}

        for item in list(existing_block_map.values()):
            key = (item.disciplina, item.block_number, item.node_id)
            if key not in expected_block_map_keys:
                db.delete(item)
                summary.block_map_deleted += 1

        for item in list(existing_edges.values()):
            key = (item.from_node_id, item.to_node_id, item.relation_type)
            if key not in expected_edge_keys:
                db.delete(item)
                summary.edges_deleted += 1

        for item in list(existing_nodes.values()):
            if item.node_id not in expected_node_ids:
                db.delete(item)
                summary.nodes_deleted += 1

        for item in list(existing_rules.values()):
            if item.rule_key not in expected_rule_keys:
                db.delete(item)
                summary.rules_deleted += 1

        db.commit()
        summary.disciplines_detected = sorted(disciplines, key=normalize_discipline)
        return summary
    finally:
        if own_session:
            db.close()


def _main() -> None:
    parser = argparse.ArgumentParser(description="Ferramentas simples para o roadmap pedagogico.")
    parser.add_argument("--validate", action="store_true", help="Valida os CSVs em docs/roadmap sem importar.")
    args = parser.parse_args()

    if args.validate:
        result = validate_roadmap_csvs()
        print(result.model_dump_json(indent=2))
        raise SystemExit(0 if result.is_valid else 1)

    parser.print_help()


if __name__ == "__main__":
    _main()
