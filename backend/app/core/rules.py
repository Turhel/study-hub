from __future__ import annotations

import unicodedata


STATUS_APROVADO = "aprovado"
STATUS_EM_ANDAMENTO = "em_andamento"
STATUS_EM_RISCO = "em_risco"

PROGRESS_LOCKED = "locked"
PROGRESS_AVAILABLE = "available"
PROGRESS_IN_PROGRESS = "in_progress"
PROGRESS_APPROVED = "approved"
PROGRESS_REVIEWING = "reviewing"
PROGRESS_MASTERED = "mastered"

BLOCK_STATUS_FUTURE_LOCKED = "future_locked"
BLOCK_STATUS_ACTIVE = "active"
BLOCK_STATUS_READY_TO_ADVANCE = "ready_to_advance"
BLOCK_STATUS_TRANSITION = "transition"
BLOCK_STATUS_REVIEWABLE = "reviewable"

BLOCK_DECISION_CONTINUE_CURRENT = "continue_current"
BLOCK_DECISION_MIXED_TRANSITION = "mixed_transition"
BLOCK_DECISION_ADVANCE_NEXT = "advance_next"

BLOCK_ACCESSIBLE_STATUSES = {
    BLOCK_STATUS_ACTIVE,
    BLOCK_STATUS_READY_TO_ADVANCE,
    BLOCK_STATUS_TRANSITION,
    BLOCK_STATUS_REVIEWABLE,
}

BLOCK_FOCUS_STATUSES = {
    BLOCK_STATUS_ACTIVE,
    BLOCK_STATUS_READY_TO_ADVANCE,
    BLOCK_STATUS_TRANSITION,
}

FORGOTTEN_GRACE_DAYS = 7
FORGOTTEN_CONTACT_THRESHOLD_DAYS = 14

DISCIPLINE_PRIORITY = {
    "matematica": 1,
    "natureza": 2,
    "biologia": 2,
    "quimica": 3,
    "fisica": 4,
    "linguagens": 5,
    "humanas": 6,
    "redacao": 7,
}

STRATEGIC_DISCIPLINE_WEIGHTS = {
    "matematica": 1.30,
    "redacao": 1.25,
    "natureza": 1.10,
    "biologia": 1.10,
    "quimica": 1.10,
    "fisica": 1.10,
    "linguagens": 1.00,
    "humanas": 0.90,
}

PERSONAL_GAP_WEIGHTS = {
    "critica": 1.35,
    "ruim": 1.20,
    "regular": 1.00,
    "boa": 0.85,
    "otima": 0.70,
}

HISTORICAL_TOPIC_WEIGHTS = {
    "matematica": {
        "basica": 1.18,
        "operacoes": 1.16,
        "porcentagem": 1.18,
        "razao": 1.14,
        "proporcao": 1.14,
        "funcao": 1.16,
        "geometria": 1.12,
        "estatistica": 1.10,
    },
    "biologia": {
        "ecologia": 1.18,
        "citologia": 1.12,
        "fisiologia": 1.12,
        "genetica": 1.10,
    },
    "quimica": {
        "estequiometria": 1.16,
        "solucoes": 1.12,
        "organica": 1.12,
        "ligacoes": 1.08,
    },
    "fisica": {
        "mecanica": 1.14,
        "eletricidade": 1.12,
        "ondulatoria": 1.08,
    },
    "linguagens": {
        "interpretacao": 1.16,
        "texto": 1.12,
        "generos": 1.08,
    },
    "humanas": {
        "brasil": 1.10,
        "cidadania": 1.08,
        "geografia": 1.08,
    },
    "redacao": {
        "competencia": 1.12,
        "repertorio": 1.10,
        "argumentacao": 1.10,
    },
}

PREREQUISITE_TOPIC_WEIGHTS = {
    "basica": 1.14,
    "operacoes": 1.16,
    "porcentagem": 1.12,
    "razao": 1.10,
    "proporcao": 1.10,
    "funcao": 1.10,
    "citologia": 1.08,
    "estequiometria": 1.10,
    "interpretacao": 1.10,
}


def normalize_discipline_name(value: str | None) -> str:
    if not value:
        return ""

    text = unicodedata.normalize("NFKD", value)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.lower()

    if "matematica" in text:
        return "matematica"
    if "natureza" in text or "ciencias da natureza" in text:
        return "natureza"
    if "biologia" in text:
        return "biologia"
    if "quimica" in text:
        return "quimica"
    if "fisica" in text:
        return "fisica"
    if (
        "linguagem" in text
        or "portugues" in text
        or "gramatica" in text
        or "literatura" in text
        or "interpretacao" in text
    ):
        return "linguagens"
    if "humana" in text or "historia" in text or "geografia" in text or "filosofia" in text or "sociologia" in text:
        return "humanas"
    if "redacao" in text:
        return "redacao"

    return text.strip()


def discipline_priority(value: str | None) -> int:
    return DISCIPLINE_PRIORITY.get(normalize_discipline_name(value), 99)


def strategic_discipline_weight(value: str | None) -> float:
    return STRATEGIC_DISCIPLINE_WEIGHTS.get(normalize_discipline_name(value), 1.0)


def _normalize_topic_text(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(char for char in text if not unicodedata.combining(char))
    return text.lower()


def historical_topic_weight(discipline: str | None, topic: str | None, enem_priority: int | None) -> float:
    normalized_discipline = normalize_discipline_name(discipline)
    normalized_topic = _normalize_topic_text(topic)
    priority = max(1, min(enem_priority or 3, 5))
    weight = 0.85 + (priority - 1) * 0.075

    for keyword, keyword_weight in HISTORICAL_TOPIC_WEIGHTS.get(normalized_discipline, {}).items():
        if keyword in normalized_topic:
            weight = max(weight, keyword_weight)

    return round(weight, 4)


def prerequisite_topic_weight(topic: str | None) -> float:
    normalized_topic = _normalize_topic_text(topic)
    weight = 1.0
    for keyword, keyword_weight in PREREQUISITE_TOPIC_WEIGHTS.items():
        if keyword in normalized_topic:
            weight = max(weight, keyword_weight)
    return round(weight, 4)


def safe_rate(acertos: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return acertos / total


def score_dominio(
    facil_total: int,
    facil_acertos: int,
    media_total: int,
    media_acertos: int,
    dificil_total: int,
    dificil_acertos: int,
) -> float:
    taxa_facil = safe_rate(facil_acertos, facil_total)
    taxa_media = safe_rate(media_acertos, media_total)
    taxa_dificil = safe_rate(dificil_acertos, dificil_total)
    return round((0.45 * taxa_facil) + (0.35 * taxa_media) + (0.20 * taxa_dificil), 4)


def status_aprovacao_bloco(
    facil_total: int,
    facil_acertos: int,
    media_total: int,
    media_acertos: int,
    dificil_total: int,
    dificil_acertos: int,
) -> str:
    taxa_facil = safe_rate(facil_acertos, facil_total)
    taxa_media = safe_rate(media_acertos, media_total)
    taxa_dificil = safe_rate(dificil_acertos, dificil_total)

    if facil_total > 0 and taxa_facil < 0.80:
        return STATUS_EM_RISCO

    has_minimum_sample = facil_total >= 15 and media_total >= 12 and dificil_total >= 6
    meets_rates = taxa_facil >= 0.85 and taxa_media >= 0.70 and taxa_dificil >= 0.40

    if has_minimum_sample and meets_rates:
        return STATUS_APROVADO

    return STATUS_EM_ANDAMENTO


def normalize_block_decision(value: str | None) -> str:
    if value == BLOCK_DECISION_MIXED_TRANSITION:
        return BLOCK_DECISION_MIXED_TRANSITION
    if value == BLOCK_DECISION_ADVANCE_NEXT:
        return BLOCK_DECISION_ADVANCE_NEXT
    return BLOCK_DECISION_CONTINUE_CURRENT


def block_is_accessible(status: str | None) -> bool:
    return status in BLOCK_ACCESSIBLE_STATUSES


def block_is_focus_status(status: str | None) -> bool:
    return status in BLOCK_FOCUS_STATUSES


def block_is_reviewable(status: str | None) -> bool:
    return status == BLOCK_STATUS_REVIEWABLE


def block_planned_mode(status: str | None) -> str:
    if status == BLOCK_STATUS_TRANSITION:
        return "transicao"
    if status == BLOCK_STATUS_READY_TO_ADVANCE:
        return "consolidacao"
    if status == BLOCK_STATUS_REVIEWABLE:
        return "reforco"
    return "aprendizado"
