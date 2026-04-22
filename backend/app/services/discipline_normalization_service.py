from __future__ import annotations

import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class DisciplineNormalization:
    strategic_discipline: str
    subarea: str
    normalized_label: str


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _key(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(_strip_accents(value).casefold().split())


STRATEGIC_LABELS = {
    "matematica": "Matemática",
    "natureza": "Natureza",
    "linguagens": "Linguagens",
    "humanas": "Humanas",
    "redacao": "Redação",
}

SUBAREA_LABELS = {
    "gramatica": "Gramática",
    "literatura": "Literatura",
    "interpretacao": "Interpretação",
    "portugues": "Português",
    "linguagens": "Linguagens",
    "biologia": "Biologia",
    "fisica": "Física",
    "quimica": "Química",
    "natureza": "Natureza",
    "ciencias da natureza": "Ciências da Natureza",
    "historia": "História",
    "geografia": "Geografia",
    "sociologia": "Sociologia",
    "filosofia": "Filosofia",
    "humanas": "Humanas",
    "ciencias humanas": "Ciências Humanas",
    "matematica": "Matemática",
    "redacao": "Redação",
}

STRATEGIC_BY_KEY = {
    "gramatica": "Linguagens",
    "literatura": "Linguagens",
    "interpretacao": "Linguagens",
    "portugues": "Linguagens",
    "linguagens": "Linguagens",
    "biologia": "Natureza",
    "fisica": "Natureza",
    "quimica": "Natureza",
    "natureza": "Natureza",
    "ciencias da natureza": "Natureza",
    "historia": "Humanas",
    "geografia": "Humanas",
    "sociologia": "Humanas",
    "filosofia": "Humanas",
    "humanas": "Humanas",
    "ciencias humanas": "Humanas",
    "matematica": "Matemática",
    "redacao": "Redação",
}


def normalize_discipline(value: str | None) -> DisciplineNormalization:
    normalized = _key(value)
    if not normalized:
        return DisciplineNormalization(
            strategic_discipline="",
            subarea="",
            normalized_label="",
        )

    strategic = STRATEGIC_BY_KEY.get(normalized)
    subarea = SUBAREA_LABELS.get(normalized)
    if strategic is None:
        fallback = (value or "").strip()
        return DisciplineNormalization(
            strategic_discipline=fallback,
            subarea=fallback,
            normalized_label=normalized,
        )

    return DisciplineNormalization(
        strategic_discipline=strategic,
        subarea=subarea or strategic,
        normalized_label=normalized,
    )


def strategic_discipline_label(value: str | None) -> str:
    return normalize_discipline(value).strategic_discipline


def subarea_label(value: str | None) -> str:
    return normalize_discipline(value).subarea
