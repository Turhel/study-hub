from __future__ import annotations

import json
import re
from dataclasses import dataclass

from sqlmodel import Session, select

from app.db import get_session
from app.llm.parsing import LLMParsingError, parse_json_object
from app.llm.prompt_loader import PromptFile, PromptLoadError, load_prompt_file
from app.llm.providers.lm_studio import LMStudioMessage
from app.llm.tasks import (
    LLMTaskConnectionError,
    LLMTaskResponse,
    LLMTaskResponseError,
    LLMTaskTimeoutError,
    estimate_messages_tokens,
    estimate_tokens,
    run_chat_messages,
)
from app.models import EssayCorrection, EssaySubmission
from app.schemas import (
    EssayCompetencyResult,
    EssayCorrectionCreateRequest,
    EssayCorrectionRequest,
    EssayCorrectionResponse,
    EssayCorrectionStoredResponse,
    EssayScoreRange,
    EssaySubmissionResponse,
)
from app.settings import get_env_int


VALID_COMPETENCY_KEYS = ("C1", "C2", "C3", "C4", "C5")
DEFAULT_CONFIDENCE_NOTE = "Estimativa assistida por modelo de IA configurado. Nao substitui correcao oficial."


class EssayCorrectionError(ValueError):
    pass


class EssayCorrectionTokenLimitError(EssayCorrectionError):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.error_code = "essay_token_limit_exceeded"
        self.status_code = 400


class EssayCorrectionProviderError(RuntimeError):
    def __init__(self, message: str, error_code: str = "essay_provider_error", status_code: int = 502) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.status_code = status_code


class EssayCorrectionUnavailableError(EssayCorrectionProviderError):
    def __init__(self, message: str) -> None:
        super().__init__(message, error_code="lm_unavailable", status_code=503)


class EssayCorrectionTimeoutError(EssayCorrectionProviderError):
    def __init__(self, message: str) -> None:
        super().__init__(message, error_code="lm_timeout", status_code=504)


class EssayCorrectionInvalidResponseError(EssayCorrectionProviderError):
    def __init__(self, message: str) -> None:
        super().__init__(message, error_code="lm_invalid_response", status_code=502)


class EssayCorrectionPromptError(EssayCorrectionProviderError):
    def __init__(self, message: str) -> None:
        super().__init__(message, error_code="prompt_not_found", status_code=500)


@dataclass(frozen=True)
class ParsedEssayCorrection:
    estimated_score_min: int
    estimated_score_max: int
    competencies: dict[str, EssayCompetencyResult]
    strengths: list[str]
    weaknesses: list[str]
    improvement_plan: list[str]
    confidence_note: str


def _essay_correction_token_limit() -> int:
    return get_env_int("STUDY_HUB_LLM_ESSAY_CORRECTION_TOKEN_LIMIT", 64000, minimum=1000)


def _clean_text(value: str) -> str:
    return re.sub(r"\r\n?", "\n", value).strip()


def _compose_correction_messages(prompt: PromptFile, payload: EssayCorrectionCreateRequest) -> list[LMStudioMessage]:
    student_goal = payload.student_goal.strip() if payload.student_goal else "Meta nao informada."
    output_contract = (
        "\n\nCONTRATO TECNICO OBRIGATORIO DA API:\n"
        "- Retorne somente JSON valido, sem markdown e sem texto antes ou depois.\n"
        "- Nao traduza os nomes das chaves JSON.\n"
        "- A chave competencies deve ser um objeto, nao uma lista.\n"
        "- competencies deve conter exatamente as chaves C1, C2, C3, C4 e C5.\n"
        "- Cada competencia deve ter score numerico e comment textual.\n"
        "- Use este esqueleto compacto:\n"
        '{"estimated_score_range":{"min":0,"max":0},"competencies":'
        '{"C1":{"score":0,"comment":""},"C2":{"score":0,"comment":""},'
        '"C3":{"score":0,"comment":""},"C4":{"score":0,"comment":""},'
        '"C5":{"score":0,"comment":""}},"strengths":[""],"weaknesses":[""],'
        '"improvement_plan":[""],"confidence_note":""}'
    )
    user_content = (
        "TEMA OFICIAL EXATO:\n"
        f"{payload.theme.strip()}\n\n"
        "REDACAO COMPLETA:\n"
        f"{payload.essay_text.strip()}\n\n"
        "META DO ALUNO:\n"
        f"{student_goal}\n\n"
        "MODO DE SAIDA:\n"
        f"{payload.mode}"
    )
    return [
        LMStudioMessage(role="system", content=f"{prompt.text}{output_contract}"),
        LMStudioMessage(role="user", content=user_content),
    ]


def _extract_section(text: str, start_label: str, next_label: str | None = None) -> str:
    # Use a more flexible start pattern to handle markdown like **C1:**
    start_pattern = rf"(?:^|\n)[#* \t]*{re.escape(start_label)}[#* \t]*:?\s*(.*)"
    
    if next_label:
        # Use a non-greedy match until the next label, which may also be formatted
        next_pattern = rf"(?:\n\s*[#* \t]*{re.escape(next_label)}[#* \t]*:?|\Z)"
        pattern = rf"(?:^|\n)[#* \t]*{re.escape(start_label)}[#* \t]*:?\s*(.*?){next_pattern}"
    else:
        pattern = start_pattern
        
    match = re.search(pattern, text, flags=re.DOTALL | re.IGNORECASE)
    return match.group(1).strip() if match else ""



def _extract_bullet_value(section: str, bullet_label: str) -> str:
    pattern = rf"-\s*{re.escape(bullet_label)}\s*:\s*(.*?)(?=\n-\s|\Z)"
    match = re.search(pattern, section, flags=re.DOTALL | re.IGNORECASE)
    return match.group(1).strip() if match else ""


def _extract_first_score(text: str, label: str) -> int | None:
    pattern = rf"{re.escape(label)}\s*:?\s*([0-9]{{1,4}})"
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _parse_competency_section(raw_text: str, key: str) -> EssayCompetencyResult:
    next_key = VALID_COMPETENCY_KEYS[VALID_COMPETENCY_KEYS.index(key) + 1] if key != "C5" else "NOTA FINAL ESTIMADA"
    section = _extract_section(raw_text, f"{key}:", next_key)
    if not section:
        raise EssayCorrectionInvalidResponseError(f"O modelo nao retornou a secao {key} da correcao.")

    score = _extract_first_score(section, "nota final da competencia")
    if score is None:
        score = _extract_first_score(section, "nota final da compet")
    if score is None:
        score = _extract_first_score(section, "faixa-base")
    if score is None or score < 0 or score > 200:
        raise EssayCorrectionInvalidResponseError(f"O modelo nao retornou nota valida para {key}.")

    motive = _extract_bullet_value(section, "motivo da nota")
    why_not_above = _extract_bullet_value(section, "por que nao recebeu a nota acima")
    fallback = section.splitlines()[0].strip() if section.splitlines() else ""
    parts = [item for item in [motive, why_not_above, fallback] if item]
    comment = " ".join(parts).strip()
    if not comment:
        raise EssayCorrectionInvalidResponseError(f"O modelo nao retornou comentario utilizavel para {key}.")

    return EssayCompetencyResult(score=score, comment=comment)


def _extract_competency_note(raw_text: str, key: str, bullet_label: str) -> str:
    next_key = VALID_COMPETENCY_KEYS[VALID_COMPETENCY_KEYS.index(key) + 1] if key != "C5" else "NOTA FINAL ESTIMADA"
    section = _extract_section(raw_text, f"{key}:", next_key)
    value = _extract_bullet_value(section, bullet_label)
    return value.strip()


def _dedupe_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for value in values:
        stripped = value.strip()
        key = stripped.casefold()
        if not stripped or key in seen:
            continue
        seen.add(key)
        normalized.append(stripped)
    return normalized


def _parse_correction_output(raw_text: str) -> ParsedEssayCorrection:
    return _parse_correction_output_defensive(raw_text)

    cleaned = _clean_text(raw_text)
    json_parsed = _parse_json_correction_output(cleaned)
    if json_parsed is not None:
        return json_parsed

    competencies = {key: _parse_competency_section(cleaned, key) for key in VALID_COMPETENCY_KEYS}

    final_section = _extract_section(cleaned, "NOTA FINAL ESTIMADA")
    final_score = _extract_first_score(final_section or cleaned, "NOTA FINAL ESTIMADA")
    if final_score is None:
        digits = re.findall(r"\b([0-9]{3,4})\b", final_section or "")
        final_score = int(digits[0]) if digits else None

    summed_score = sum(item.score for item in competencies.values())
    if final_score is None:
        final_score = summed_score

    if final_score < 0 or final_score > 1000:
        raise EssayCorrectionInvalidResponseError("O modelo retornou nota final estimada fora da faixa esperada.")

    strengths = _dedupe_keep_order(
        [_extract_competency_note(cleaned, key, "ponto forte principal") for key in VALID_COMPETENCY_KEYS]
    )
    confidence_level = confidence_match.group(1).splitlines()[0].strip(" -:") if confidence_match else ""
    confidence_note = DEFAULT_CONFIDENCE_NOTE
    if confidence_level:
        confidence_note = f"{DEFAULT_CONFIDENCE_NOTE} Grau de confianca do modelo: {confidence_level}."

    return ParsedEssayCorrection(
        estimated_score_min=final_score,
        estimated_score_max=final_score,
        competencies=competencies,
        strengths=strengths,
        weaknesses=weaknesses,
        improvement_plan=improvement_plan,
        confidence_note=confidence_note,
    )


def _canonical_json_key(value: str) -> str:
    normalized = value.strip().casefold()
    replacements = {
        "á": "a",
        "à": "a",
        "â": "a",
        "ã": "a",
        "é": "e",
        "ê": "e",
        "í": "i",
        "ó": "o",
        "ô": "o",
        "õ": "o",
        "ú": "u",
        "ç": "c",
    }
    for source, target in replacements.items():
        normalized = normalized.replace(source, target)
    return re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")


def _value_from_aliases(payload: dict, aliases: tuple[str, ...]) -> object | None:
    canonical_aliases = {_canonical_json_key(alias) for alias in aliases}
    for key, value in payload.items():
        if _canonical_json_key(str(key)) in canonical_aliases:
            return value
    return None


def _competency_key_from_value(value: object) -> str | None:
    text = str(value or "").strip().upper()
    match = re.search(r"\bC\s*([1-5])\b", text)
    if match:
        return f"C{match.group(1)}"
    match = re.search(r"COMPET[ÊE]NCIA\s*([1-5])", text)
    if match:
        return f"C{match.group(1)}"
    return text if text in VALID_COMPETENCY_KEYS else None


def _normalize_string_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _normalize_competency_item(raw_item: object) -> dict[str, object] | None:
    if not isinstance(raw_item, dict):
        return None
    score = _value_from_aliases(raw_item, ("score", "nota", "pontuacao", "pontuação"))
    comment = _value_from_aliases(
        raw_item,
        ("comment", "comentario", "comentário", "feedback", "justificativa", "motivo", "analysis", "analise"),
    )
    if comment is None:
        comment_parts = [
            str(value).strip()
            for key, value in raw_item.items()
            if _canonical_json_key(str(key)) not in {"id", "name", "nome", "competencia", "score", "nota", "pontuacao"}
            and str(value).strip()
        ]
        comment = " ".join(comment_parts)
    return {"score": score, "comment": comment}


def _normalize_competencies(raw_competencies: object) -> dict[str, dict[str, object]]:
    normalized: dict[str, dict[str, object]] = {}
    if isinstance(raw_competencies, dict):
        for raw_key, raw_item in raw_competencies.items():
            key = _competency_key_from_value(raw_key)
            if key is None and isinstance(raw_item, dict):
                key = _competency_key_from_value(
                    _value_from_aliases(raw_item, ("id", "name", "nome", "competencia", "competência"))
                )
            item = _normalize_competency_item(raw_item)
            if key is not None and item is not None:
                normalized[key] = item
    elif isinstance(raw_competencies, list):
        for raw_item in raw_competencies:
            if not isinstance(raw_item, dict):
                continue
            key = _competency_key_from_value(
                _value_from_aliases(raw_item, ("id", "name", "nome", "competencia", "competência"))
            )
            item = _normalize_competency_item(raw_item)
            if key is not None and item is not None:
                normalized[key] = item
    return normalized


def _normalize_score_range(payload: dict, competencies: dict[str, dict[str, object]]) -> dict[str, int]:
    raw_range = _value_from_aliases(
        payload,
        (
            "estimated_score_range",
            "score_range",
            "nota_estimada",
            "faixa_nota",
            "faixa_de_nota",
            "nota_final_estimada",
            "nota",
            "score",
        ),
    )
    if isinstance(raw_range, dict):
        minimum = _value_from_aliases(raw_range, ("min", "minimum", "minimo", "mínimo"))
        maximum = _value_from_aliases(raw_range, ("max", "maximum", "maximo", "máximo"))
        if minimum is not None or maximum is not None:
            min_score = int(float(str(minimum if minimum is not None else maximum).strip()))
            max_score = int(float(str(maximum if maximum is not None else minimum).strip()))
            return {"min": min_score, "max": max_score}
    if isinstance(raw_range, (int, float, str)):
        score = int(float(str(raw_range).strip()))
        return {"min": score, "max": score}

    summed = 0
    for item in competencies.values():
        raw_score = _value_from_aliases(item, ("score", "nota", "pontuacao", "pontuação"))
        if raw_score is not None:
            summed += int(float(str(raw_score).strip()))
    if summed > 0:
        return {"min": summed, "max": summed}

    raise EssayCorrectionInvalidResponseError("O modelo retornou JSON sem faixa de nota estimada utilizavel.")


def _normalize_json_correction_payload(payload: dict) -> dict:
    raw_competencies = _value_from_aliases(payload, ("competencies", "competencias", "competências"))
    competencies = _normalize_competencies(raw_competencies)
    score_range = _normalize_score_range(payload, competencies)
    strengths = _value_from_aliases(payload, ("strengths", "pontos_fortes", "forcas", "forças"))
    weaknesses = _value_from_aliases(payload, ("weaknesses", "pontos_fracos", "fragilidades"))
    improvement_plan = _value_from_aliases(
        payload,
        ("improvement_plan", "plano_melhoria", "plano_de_melhoria", "recomendacoes", "recomendações"),
    )
    confidence_note = _value_from_aliases(
        payload,
        ("confidence_note", "observacao_confianca", "observação_confiança", "nota_de_confianca", "confianca"),
    )
    return {
        "estimated_score_range": score_range,
        "competencies": competencies,
        "strengths": _normalize_string_list(strengths),
        "weaknesses": _normalize_string_list(weaknesses),
        "improvement_plan": _normalize_string_list(improvement_plan),
        "confidence_note": str(confidence_note).strip() if confidence_note is not None else DEFAULT_CONFIDENCE_NOTE,
    }


def _parse_json_correction_output(raw_text: str) -> ParsedEssayCorrection | None:
    try:
        payload = parse_json_object(raw_text)
    except LLMParsingError:
        return None

    payload = _normalize_json_correction_payload(payload)

    try:
        score_range = payload["estimated_score_range"]
        competencies_payload = payload["competencies"]
        strengths = payload.get("strengths") or []
        weaknesses = payload.get("weaknesses") or []
        improvement_plan = payload.get("improvement_plan") or []
        confidence_note = payload.get("confidence_note") or DEFAULT_CONFIDENCE_NOTE
    except (KeyError, TypeError) as exc:
        raise EssayCorrectionInvalidResponseError(
            "O modelo retornou JSON, mas faltam campos obrigatorios da correcao de redacao."
        ) from exc

    if not isinstance(score_range, dict) or not isinstance(competencies_payload, dict):
        raise EssayCorrectionInvalidResponseError(
            "O modelo retornou JSON com estrutura invalida para nota ou competencias."
        )

    try:
        estimated_min = int(score_range["min"])
        estimated_max = int(score_range["max"])
    except (KeyError, TypeError, ValueError) as exc:
        raise EssayCorrectionInvalidResponseError("O modelo retornou faixa de nota invalida no JSON.") from exc

    if estimated_min < 0 or estimated_max > 1000 or estimated_max < estimated_min:
        raise EssayCorrectionInvalidResponseError("O modelo retornou faixa de nota fora da faixa esperada.")

    competencies: dict[str, EssayCompetencyResult] = {}
    for key in VALID_COMPETENCY_KEYS:
        item = competencies_payload.get(key)
        if not isinstance(item, dict):
            raise EssayCorrectionInvalidResponseError(f"O JSON da correcao nao trouxe a competencia {key}.")
        try:
            score = int(item["score"])
        except (KeyError, TypeError, ValueError) as exc:
            raise EssayCorrectionInvalidResponseError(f"O JSON da correcao trouxe nota invalida para {key}.") from exc
        comment = str(item.get("comment") or "").strip()
        if score < 0 or score > 200:
            raise EssayCorrectionInvalidResponseError(f"O JSON da correcao trouxe nota fora da faixa para {key}.")
        if not comment:
            raise EssayCorrectionInvalidResponseError(f"O JSON da correcao nao trouxe comentario para {key}.")
        competencies[key] = EssayCompetencyResult(score=score, comment=comment)

    def clean_list(value: object, fallback: str) -> list[str]:
        if not isinstance(value, list):
            return [fallback]
        cleaned = _dedupe_keep_order([str(item) for item in value])
        return cleaned or [fallback]

    return ParsedEssayCorrection(
        estimated_score_min=estimated_min,
        estimated_score_max=estimated_max,
        competencies=competencies,
        strengths=clean_list(strengths, "A resposta JSON nao trouxe pontos fortes utilizaveis."),
        weaknesses=clean_list(weaknesses, "A resposta JSON nao trouxe fragilidades utilizaveis."),
        improvement_plan=clean_list(improvement_plan, "Revise os comentarios por competencia e priorize o ponto mais fraco."),
        confidence_note=str(confidence_note).strip() or DEFAULT_CONFIDENCE_NOTE,
    )
    confidence_match = re.search(
        r"GRAU DE CONFIAN[ÇC]A\s*:?\s*(.+)",
        cleaned,
        flags=re.IGNORECASE,
    )
def _parse_correction_output_defensive(raw_text: str) -> ParsedEssayCorrection:
    cleaned = _clean_text(raw_text)
    json_parsed = _parse_json_correction_output(cleaned)
    if json_parsed is not None:
        return json_parsed

    competencies = {key: _parse_competency_section(cleaned, key) for key in VALID_COMPETENCY_KEYS}
    final_section = _extract_section(cleaned, "NOTA FINAL ESTIMADA")
    final_score = _extract_first_score(final_section or cleaned, "NOTA FINAL ESTIMADA")
    if final_score is None:
        digits = re.findall(r"\b([0-9]{3,4})\b", final_section or "")
        final_score = int(digits[0]) if digits else sum(item.score for item in competencies.values())

    if final_score < 0 or final_score > 1000:
        raise EssayCorrectionInvalidResponseError("O modelo retornou nota final estimada fora da faixa esperada.")

    strengths = _dedupe_keep_order(
        [_extract_competency_note(cleaned, key, "ponto forte principal") for key in VALID_COMPETENCY_KEYS]
    ) or ["Boa base identificada em pelo menos uma competencia, mas a correcao precisa ser lida junto dos comentarios."]
    weaknesses = _dedupe_keep_order(
        [_extract_competency_note(cleaned, key, "falha principal") for key in VALID_COMPETENCY_KEYS]
    ) or ["A correcao nao destacou falhas de forma limpa o suficiente para resumir melhor."]
    improvement_plan = _dedupe_keep_order(
        [_extract_competency_note(cleaned, key, "por que nao recebeu a nota acima") for key in VALID_COMPETENCY_KEYS]
    ) or ["Revise os comentarios de cada competencia e priorize o primeiro ponto que impediu uma nota mais alta."]

    confidence_match = re.search(
        r"GRAU DE CONFIAN[Ã‡C]A\s*:?\s*(.+)",
        cleaned,
        flags=re.IGNORECASE,
    )
    confidence_level = confidence_match.group(1).splitlines()[0].strip(" -:") if confidence_match else ""
    confidence_note = DEFAULT_CONFIDENCE_NOTE
    if confidence_level:
        confidence_note = f"{DEFAULT_CONFIDENCE_NOTE} Grau de confianca do modelo: {confidence_level}."

    return ParsedEssayCorrection(
        estimated_score_min=final_score,
        estimated_score_max=final_score,
        competencies=competencies,
        strengths=strengths,
        weaknesses=weaknesses,
        improvement_plan=improvement_plan,
        confidence_note=confidence_note,
    )


def _to_submission_response(submission: EssaySubmission) -> EssaySubmissionResponse:
    return EssaySubmissionResponse(
        id=submission.id or 0,
        theme=submission.theme,
        essay_text=submission.essay_text,
        created_at=submission.created_at.isoformat(),
    )


def _to_stored_response(submission: EssaySubmission, correction: EssayCorrection) -> EssayCorrectionStoredResponse:
    competencies = {
        "C1": EssayCompetencyResult(score=correction.c1_score, comment=correction.c1_comment),
        "C2": EssayCompetencyResult(score=correction.c2_score, comment=correction.c2_comment),
        "C3": EssayCompetencyResult(score=correction.c3_score, comment=correction.c3_comment),
        "C4": EssayCompetencyResult(score=correction.c4_score, comment=correction.c4_comment),
        "C5": EssayCompetencyResult(score=correction.c5_score, comment=correction.c5_comment),
    }
    return EssayCorrectionStoredResponse(
        id=correction.id or 0,
        submission=_to_submission_response(submission),
        provider=correction.provider,
        model=correction.model,
        prompt_name=correction.prompt_name,
        prompt_hash=correction.prompt_hash,
        mode=correction.mode,  # type: ignore[arg-type]
        estimated_score_range=EssayScoreRange(min=correction.estimated_score_min, max=correction.estimated_score_max),
        competencies=competencies,
        strengths=json.loads(correction.strengths_json),
        weaknesses=json.loads(correction.weaknesses_json),
        improvement_plan=json.loads(correction.improvement_plan_json),
        confidence_note=correction.confidence_note,
        tokens_input=correction.tokens_input,
        tokens_output=correction.tokens_output,
        tokens_total=correction.tokens_total,
        created_at=correction.created_at.isoformat(),
    )


def _build_stored_correction(
    payload: EssayCorrectionCreateRequest,
    result: LLMTaskResponse,
    parsed: ParsedEssayCorrection,
    prompt: PromptFile,
    submission_id: int,
) -> EssayCorrection:
    estimated_input = estimate_tokens(prompt.text) + estimate_tokens(payload.theme) + estimate_tokens(payload.essay_text)
    estimated_output = estimate_tokens(result.output_text)
    tokens_input = result.tokens_input or estimated_input
    tokens_output = result.tokens_output or estimated_output
    tokens_total = result.tokens_total or (tokens_input + tokens_output)

    return EssayCorrection(
        essay_submission_id=submission_id,
        provider=result.provider,
        model=result.model,
        prompt_name=prompt.name,
        prompt_hash=prompt.sha256,
        mode=payload.mode,
        estimated_score_min=parsed.estimated_score_min,
        estimated_score_max=parsed.estimated_score_max,
        c1_score=parsed.competencies["C1"].score,
        c1_comment=parsed.competencies["C1"].comment,
        c2_score=parsed.competencies["C2"].score,
        c2_comment=parsed.competencies["C2"].comment,
        c3_score=parsed.competencies["C3"].score,
        c3_comment=parsed.competencies["C3"].comment,
        c4_score=parsed.competencies["C4"].score,
        c4_comment=parsed.competencies["C4"].comment,
        c5_score=parsed.competencies["C5"].score,
        c5_comment=parsed.competencies["C5"].comment,
        strengths_json=json.dumps(parsed.strengths, ensure_ascii=True),
        weaknesses_json=json.dumps(parsed.weaknesses, ensure_ascii=True),
        improvement_plan_json=json.dumps(parsed.improvement_plan, ensure_ascii=True),
        confidence_note=parsed.confidence_note,
        tokens_input=tokens_input,
        tokens_output=tokens_output,
        tokens_total=tokens_total,
    )


def _run_essay_correction(payload: EssayCorrectionCreateRequest, prompt: PromptFile) -> tuple[LLMTaskResponse, ParsedEssayCorrection]:
    if not payload.theme.strip():
        raise EssayCorrectionError("Tema da redacao e obrigatorio.")
    if not payload.essay_text.strip():
        raise EssayCorrectionError("Texto da redacao e obrigatorio.")

    messages = _compose_correction_messages(prompt, payload)
    estimated_input = estimate_messages_tokens(messages)
    token_limit = _essay_correction_token_limit()
    if estimated_input >= token_limit:
        raise EssayCorrectionTokenLimitError(
            f"A redacao ficou grande demais para o limite configurado de {token_limit} tokens da correcao."
        )

    try:
        result = run_chat_messages(
            task_name={"score_only": "essay_score", "detailed": "essay_detailed", "teach": "essay_teach"}[payload.mode],
            messages=messages,
            temperature=0.1,
        )
    except LLMTaskTimeoutError as exc:
        raise EssayCorrectionTimeoutError(
            "A correcao demorou mais do que o esperado no provider configurado. Tente novamente ou reduza o tamanho do texto."
        ) from exc
    except LLMTaskConnectionError as exc:
        message = str(exc).strip()
        if "OPENROUTER_API_KEY" in message:
            raise EssayCorrectionUnavailableError(message) from exc
        raise EssayCorrectionUnavailableError(
            "O provider de IA configurado esta offline, inacessivel ou incompleto no momento. Verifique a conexao e as credenciais configuradas."
        ) from exc
    except LLMTaskResponseError as exc:
        raise EssayCorrectionInvalidResponseError(
            "O modelo respondeu, mas a saida nao veio em formato confiavel para a correcao de redacao."
        ) from exc

    try:
        parsed = _parse_correction_output_defensive(result.output_text)
    except EssayCorrectionInvalidResponseError:
        raise
    except Exception as exc:
        raise EssayCorrectionInvalidResponseError(
            "O modelo respondeu, mas a correcao nao pode ser interpretada com seguranca."
        ) from exc
    total_tokens = result.tokens_total or (estimated_input + estimate_tokens(result.output_text))
    if total_tokens > token_limit:
        raise EssayCorrectionTokenLimitError(
            f"A correcao excedeu o limite configurado de {token_limit} tokens e nao foi persistida."
        )

    return result, parsed


def create_essay_correction(payload: EssayCorrectionCreateRequest, session: Session | None = None) -> EssayCorrectionStoredResponse:
    own_session = session is None
    db = session or get_session()
    try:
        try:
            prompt = load_prompt_file("essay_correction")
        except PromptLoadError as exc:
            raise EssayCorrectionPromptError(str(exc)) from exc

        llm_result, parsed = _run_essay_correction(payload, prompt)

        submission = EssaySubmission(theme=payload.theme.strip(), essay_text=payload.essay_text.strip())
        db.add(submission)
        db.commit()
        db.refresh(submission)

        correction = _build_stored_correction(payload, llm_result, parsed, prompt, submission.id or 0)
        db.add(correction)
        db.commit()
        db.refresh(correction)
        return _to_stored_response(submission, correction)
    finally:
        if own_session:
            db.close()


def get_essay_correction(correction_id: int, session: Session | None = None) -> EssayCorrectionStoredResponse:
    own_session = session is None
    db = session or get_session()
    try:
        correction = db.get(EssayCorrection, correction_id)
        if correction is None:
            raise EssayCorrectionError("Correcao de redacao nao encontrada.")

        submission = db.get(EssaySubmission, correction.essay_submission_id)
        if submission is None:
            raise EssayCorrectionError("Redacao original da correcao nao encontrada.")

        return _to_stored_response(submission, correction)
    finally:
        if own_session:
            db.close()


def correct_essay(payload: EssayCorrectionRequest) -> EssayCorrectionResponse:
    try:
        prompt = load_prompt_file("essay_correction")
    except PromptLoadError as exc:
        raise EssayCorrectionPromptError(str(exc)) from exc

    _, parsed = _run_essay_correction(
        EssayCorrectionCreateRequest(
            theme=payload.theme,
            essay_text=payload.essay_text,
            student_goal=payload.student_goal,
            mode=payload.mode,
        ),
        prompt,
    )
    return EssayCorrectionResponse(
        estimated_score_range=EssayScoreRange(min=parsed.estimated_score_min, max=parsed.estimated_score_max),
        competencies=parsed.competencies,
        strengths=parsed.strengths,
        weaknesses=parsed.weaknesses,
        improvement_plan=parsed.improvement_plan,
        confidence_note=parsed.confidence_note,
    )


def get_submission_for_correction(correction_id: int, session: Session) -> tuple[EssaySubmission, EssayCorrection]:
    correction = session.get(EssayCorrection, correction_id)
    if correction is None:
        raise EssayCorrectionError("Correcao de redacao nao encontrada.")

    submission = session.get(EssaySubmission, correction.essay_submission_id)
    if submission is None:
        raise EssayCorrectionError("Redacao original da correcao nao encontrada.")

    return submission, correction


def list_corrections_for_submission(submission_id: int, session: Session) -> list[EssayCorrection]:
    return list(
        session.exec(
            select(EssayCorrection).where(EssayCorrection.essay_submission_id == submission_id).order_by(EssayCorrection.created_at.desc())
        )
    )
