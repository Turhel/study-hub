from __future__ import annotations

STATUS_APROVADO = "aprovado"
STATUS_EM_ANDAMENTO = "em_andamento"
STATUS_EM_RISCO = "em_risco"


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

    has_minimum_sample = (
        facil_total >= 15
        and media_total >= 12
        and dificil_total >= 6
    )
    meets_rates = (
        taxa_facil >= 0.85
        and taxa_media >= 0.70
        and taxa_dificil >= 0.40
    )

    if has_minimum_sample and meets_rates:
        return STATUS_APROVADO

    return STATUS_EM_ANDAMENTO
