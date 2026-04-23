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
