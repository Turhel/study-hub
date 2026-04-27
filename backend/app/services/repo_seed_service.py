from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from sqlmodel import Session, select

from app.models import Block, BlockSubject, Subject


@dataclass
class RepoSeedExportSummary:
    subjects_exported: int
    blocks_exported: int
    block_subjects_exported: int
    target_directory: str


@dataclass
class RepoSeedSyncSummary:
    subjects_created: int = 0
    subjects_updated: int = 0
    blocks_created: int = 0
    blocks_updated: int = 0
    block_subjects_created: int = 0
    block_subjects_updated: int = 0
    source_directory: str = ""


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def get_repo_seed_dir() -> Path:
    return _repo_root() / "docs" / "data_seed"


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def export_structural_seed_from_session(session: Session) -> RepoSeedExportSummary:
    seed_dir = get_repo_seed_dir()

    subjects = session.exec(select(Subject).order_by(Subject.id)).all()
    blocks = session.exec(select(Block).order_by(Block.id)).all()
    block_subjects = session.exec(select(BlockSubject).order_by(BlockSubject.id)).all()

    _write_csv(
        seed_dir / "subjects.csv",
        ["id", "disciplina", "assunto", "subassunto", "competencia", "habilidade", "prioridade_enem", "ativo"],
        [subject.model_dump() for subject in subjects],
    )
    _write_csv(
        seed_dir / "blocks.csv",
        ["id", "nome", "disciplina", "descricao", "ordem", "status"],
        [block.model_dump() for block in blocks],
    )
    _write_csv(
        seed_dir / "block_subjects.csv",
        ["id", "block_id", "subject_id"],
        [item.model_dump() for item in block_subjects],
    )

    return RepoSeedExportSummary(
        subjects_exported=len(subjects),
        blocks_exported=len(blocks),
        block_subjects_exported=len(block_subjects),
        target_directory=str(seed_dir.resolve()),
    )


def load_structural_seed_rows() -> dict[str, list[dict[str, str]]]:
    seed_dir = get_repo_seed_dir()
    required = {
        "subjects": ("subjects.csv", {"id", "disciplina", "assunto", "subassunto", "competencia", "habilidade", "prioridade_enem", "ativo"}),
        "blocks": ("blocks.csv", {"id", "nome", "disciplina", "descricao", "ordem", "status"}),
        "block_subjects": ("block_subjects.csv", {"id", "block_id", "subject_id"}),
    }
    loaded: dict[str, list[dict[str, str]]] = {}

    for key, (filename, required_columns) in required.items():
        path = seed_dir / filename
        if not path.exists():
            raise FileNotFoundError(f"Arquivo de seed estrutural nao encontrado: {path}")
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            fieldnames = set(reader.fieldnames or [])
            missing = required_columns - fieldnames
            if missing:
                missing_text = ", ".join(sorted(missing))
                raise ValueError(f"{filename} sem colunas obrigatorias: {missing_text}")
            loaded[key] = [{name: (value or "").strip() for name, value in row.items()} for row in reader]

    return loaded


def _parse_bool(value: str) -> bool:
    return value.strip().casefold() in {"1", "true", "sim", "yes", "on"}


def _subject_payload(row: dict[str, str]) -> dict[str, object]:
    return {
        "id": int(row["id"]),
        "disciplina": row["disciplina"],
        "assunto": row["assunto"],
        "subassunto": row["subassunto"] or None,
        "competencia": row["competencia"] or None,
        "habilidade": row["habilidade"] or None,
        "prioridade_enem": int(row["prioridade_enem"] or 3),
        "ativo": _parse_bool(row["ativo"]),
    }


def _block_payload(row: dict[str, str]) -> dict[str, object]:
    return {
        "id": int(row["id"]),
        "nome": row["nome"],
        "disciplina": row["disciplina"],
        "descricao": row["descricao"] or None,
        "ordem": int(row["ordem"] or 0),
        "status": row["status"] or "em_andamento",
    }


def _block_subject_payload(row: dict[str, str]) -> dict[str, object]:
    return {
        "id": int(row["id"]),
        "block_id": int(row["block_id"]),
        "subject_id": int(row["subject_id"]),
    }


def _payload_has_changes(instance: object, payload: dict[str, object]) -> bool:
    return any(getattr(instance, field_name) != value for field_name, value in payload.items())


def _apply_payload(instance: object, payload: dict[str, object]) -> None:
    for field_name, value in payload.items():
        setattr(instance, field_name, value)


def sync_structural_seed_into_session(
    session: Session,
    *,
    apply_changes: bool,
) -> RepoSeedSyncSummary:
    seed_rows = load_structural_seed_rows()
    summary = RepoSeedSyncSummary(source_directory=str(get_repo_seed_dir().resolve()))

    subjects_by_id = {row.id: row for row in session.exec(select(Subject)).all()}
    for row in seed_rows["subjects"]:
        payload = _subject_payload(row)
        subject_id = int(payload["id"])
        existing = subjects_by_id.get(subject_id)
        if existing is None:
            summary.subjects_created += 1
            if apply_changes:
                subject = Subject(**payload)
                session.add(subject)
                subjects_by_id[subject_id] = subject
            continue
        if _payload_has_changes(existing, payload):
            summary.subjects_updated += 1
            if apply_changes:
                _apply_payload(existing, payload)
                session.add(existing)

    blocks_by_id = {row.id: row for row in session.exec(select(Block)).all()}
    for row in seed_rows["blocks"]:
        payload = _block_payload(row)
        block_id = int(payload["id"])
        existing = blocks_by_id.get(block_id)
        if existing is None:
            summary.blocks_created += 1
            if apply_changes:
                block = Block(**payload)
                session.add(block)
                blocks_by_id[block_id] = block
            continue
        if _payload_has_changes(existing, payload):
            summary.blocks_updated += 1
            if apply_changes:
                _apply_payload(existing, payload)
                session.add(existing)

    block_subjects_by_id = {row.id: row for row in session.exec(select(BlockSubject)).all()}
    for row in seed_rows["block_subjects"]:
        payload = _block_subject_payload(row)
        link_id = int(payload["id"])
        existing = block_subjects_by_id.get(link_id)
        if existing is None:
            summary.block_subjects_created += 1
            if apply_changes:
                item = BlockSubject(**payload)
                session.add(item)
                block_subjects_by_id[link_id] = item
            continue
        if _payload_has_changes(existing, payload):
            summary.block_subjects_updated += 1
            if apply_changes:
                _apply_payload(existing, payload)
                session.add(existing)

    if apply_changes:
        session.commit()

    return summary
