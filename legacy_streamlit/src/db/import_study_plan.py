from __future__ import annotations

import argparse
import re
import unicodedata
from pathlib import Path
from typing import Any

import pandas as pd
from sqlmodel import Session, select

from src.db.init_db import init_db
from src.db.models import Block, BlockSubject, Subject
from src.db.session import engine


COLUMN_ALIASES = {
    "disciplina": {"disciplina", "materia", "matéria", "area", "área"},
    "assunto": {"assunto", "tema"},
    "subassunto": {"subassunto", "sub_assunto", "conteudo", "conteúdo", "topico", "tópico"},
    "bloco": {"bloco", "block", "numero_bloco", "número_bloco", "num_bloco"},
    "ordem": {"ordem", "ordem_bloco", "ordem_do_bloco"},
    "competencia": {"competencia", "competência"},
    "habilidade": {"habilidade"},
    "prioridade_enem": {"prioridade_enem", "prioridade", "peso_enem"},
}


def normalize_name(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-zA-Z0-9]+", "_", text.lower()).strip("_")
    return text


def clean_text(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    return text


def clean_int(value: Any, default: int = 0) -> int:
    text = clean_text(value)
    if text is None:
        return default
    match = re.search(r"\d+", text)
    if not match:
        return default
    return int(match.group())


def priority_value(value: Any) -> int:
    number = clean_int(value, default=3)
    return min(max(number, 1), 5)


def map_columns(columns: list[str]) -> dict[str, str]:
    normalized = {normalize_name(column): column for column in columns}
    mapped: dict[str, str] = {}

    for target, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            normalized_alias = normalize_name(alias)
            if normalized_alias in normalized:
                mapped[target] = normalized[normalized_alias]
                break

    return mapped


def best_sheet_name(sheets: dict[str, pd.DataFrame]) -> str | None:
    if "conteudos_por_bloco" in sheets:
        return "conteudos_por_bloco"

    for name, frame in sheets.items():
        mapped = map_columns(list(frame.columns))
        if "disciplina" in mapped and "assunto" in mapped:
            return name

    return None


def remove_obvious_duplicates(session: Session) -> tuple[int, int]:
    removed_subjects = 0
    removed_links = 0
    subjects_by_key: dict[tuple[str, str, str | None], Subject] = {}

    for subject in session.exec(select(Subject).order_by(Subject.id)).all():
        key = (subject.disciplina, subject.assunto, subject.subassunto)
        keeper = subjects_by_key.get(key)
        if keeper is None:
            subjects_by_key[key] = subject
            continue

        links = session.exec(select(BlockSubject).where(BlockSubject.subject_id == subject.id)).all()
        for link in links:
            existing = session.exec(
                select(BlockSubject)
                .where(BlockSubject.block_id == link.block_id)
                .where(BlockSubject.subject_id == keeper.id)
            ).first()
            if existing is None:
                link.subject_id = keeper.id
                session.add(link)
            else:
                session.delete(link)
                removed_links += 1

        session.delete(subject)
        removed_subjects += 1

    seen_links: set[tuple[int, int]] = set()
    for link in session.exec(select(BlockSubject).order_by(BlockSubject.id)).all():
        key = (link.block_id, link.subject_id)
        if key in seen_links:
            session.delete(link)
            removed_links += 1
        else:
            seen_links.add(key)

    session.commit()
    return removed_subjects, removed_links


def import_study_plan(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Arquivo nao encontrado: {path}")
    if path.suffix.lower() != ".xlsx":
        raise ValueError("Informe um arquivo .xlsx")

    init_db()
    sheets = pd.read_excel(path, sheet_name=None)
    print("Abas encontradas:", ", ".join(sheets.keys()))

    sheet_name = best_sheet_name(sheets)
    if sheet_name is None:
        raise ValueError("Nenhuma aba possui as colunas essenciais: disciplina e assunto.")

    frame = sheets[sheet_name].copy()
    mapped = map_columns(list(frame.columns))
    print(f"Aba usada: {sheet_name}")
    print("Colunas mapeadas:", ", ".join(f"{key}={value}" for key, value in mapped.items()))

    if "disciplina" not in mapped or "assunto" not in mapped:
        raise ValueError("Colunas obrigatorias ausentes: disciplina e assunto.")

    created_subjects = 0
    existing_subjects = 0
    created_blocks = 0
    existing_blocks = 0
    created_links = 0
    existing_links_count = 0
    skipped_rows = 0

    with Session(engine) as session:
        subjects_by_key = {
            (subject.disciplina, subject.assunto, subject.subassunto): subject
            for subject in session.exec(select(Subject)).all()
        }
        blocks_by_key = {
            (block.nome, block.disciplina): block
            for block in session.exec(select(Block)).all()
        }
        existing_link_keys = {
            (link.block_id, link.subject_id)
            for link in session.exec(select(BlockSubject)).all()
        }

        for _, row in frame.iterrows():
            disciplina = clean_text(row.get(mapped["disciplina"]))
            assunto = clean_text(row.get(mapped["assunto"]))

            if disciplina is None or assunto is None:
                skipped_rows += 1
                continue

            subassunto = clean_text(row.get(mapped["subassunto"])) if "subassunto" in mapped else None
            competencia = clean_text(row.get(mapped["competencia"])) if "competencia" in mapped else None
            habilidade = clean_text(row.get(mapped["habilidade"])) if "habilidade" in mapped else None
            prioridade = priority_value(row.get(mapped["prioridade_enem"])) if "prioridade_enem" in mapped else 3

            subject_key = (disciplina, assunto, subassunto)
            subject = subjects_by_key.get(subject_key)
            if subject is None:
                subject = Subject(
                    disciplina=disciplina,
                    assunto=assunto,
                    subassunto=subassunto,
                    competencia=competencia,
                    habilidade=habilidade,
                    prioridade_enem=prioridade,
                )
                session.add(subject)
                session.flush()
                session.refresh(subject)
                subjects_by_key[subject_key] = subject
                created_subjects += 1
            else:
                existing_subjects += 1

            if "bloco" not in mapped:
                continue

            bloco_value = clean_text(row.get(mapped["bloco"]))
            if bloco_value is None:
                continue

            ordem = clean_int(row.get(mapped["ordem"]), default=clean_int(bloco_value)) if "ordem" in mapped else clean_int(bloco_value)
            block_name = f"Bloco {ordem}" if ordem else f"Bloco {bloco_value}"
            block_key = (block_name, disciplina)
            block = blocks_by_key.get(block_key)

            if block is None:
                block = Block(nome=block_name, disciplina=disciplina, ordem=ordem)
                session.add(block)
                session.flush()
                session.refresh(block)
                blocks_by_key[block_key] = block
                created_blocks += 1
            else:
                existing_blocks += 1

            if subject.id is not None and block.id is not None:
                link_key = (block.id, subject.id)
                if link_key in existing_link_keys:
                    existing_links_count += 1
                else:
                    session.add(BlockSubject(block_id=block.id, subject_id=subject.id))
                    existing_link_keys.add(link_key)
                    created_links += 1

        session.commit()
        removed_subjects, removed_links = remove_obvious_duplicates(session)

    print("\nResumo da importacao")
    print(f"Subjects criados: {created_subjects}")
    print(f"Subjects ja existentes: {existing_subjects}")
    print(f"Blocks criados: {created_blocks}")
    print(f"Blocks ja existentes: {existing_blocks}")
    print(f"Links block_subjects criados: {created_links}")
    print(f"Links ja existentes: {existing_links_count}")
    print(f"Linhas ignoradas: {skipped_rows}")
    print(f"Subjects duplicados removidos: {removed_subjects}")
    print(f"Links duplicados removidos: {removed_links}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Importa conteudos e blocos de uma planilha ENEM.")
    parser.add_argument("xlsx_path", help="Caminho para o arquivo .xlsx")
    args = parser.parse_args()

    import_study_plan(Path(args.xlsx_path))


if __name__ == "__main__":
    main()
