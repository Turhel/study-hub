from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Literal

from sqlmodel import Session, select

from app.db import get_session
from app.llm.prompt_loader import PromptFile, load_prompt_file
from app.llm.providers.lm_studio import LMStudioMessage
from app.llm.tasks import (
    LLMTaskConnectionError,
    LLMTaskResponse,
    LLMTaskResponseError,
    LLMTaskTimeoutError,
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
from app.settings import get_env_float


VALID_COMPETENCY_KEYS = ("C1", "C2", "C3", "C4", "C5")
DEFAULT_CONFIDENCE_NOTE = "Estimativa assistida por modelo local. Nao substitui correcao oficial."


class EssayCorrectionError(ValueError):
    pass


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
    return int(get_env_float("STUDY_HUB_LLM_ESSAY_CORRECTION_TOKEN_LIMIT", 64000, minimum=1000.0))


def _clean_text(value: str) -> str:
    return re.sub(r"\r\n?", "\n", value).strip()


def _compose_correction_messages(prompt: PromptFile, payload: EssayCorrectionCreateRequest) -> list[LMStudioMessage]:
    student_goal = payload.student_goal.strip() if payload.student_goal else "Meta nao informada."
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
        LMStudioMessage(role="system", content=prompt.text),
        LMStudioMessage(role="user", content=user_content),
    ]


def _extract_section(text: str, start_label: str, next_label: str | None = None) -> str:
    pattern = rf"{re.escape(start_label)}\s*(.*)"
    if next_label:
        pattern = rf"{re.escape(start_label)}\s*(.*?)(?=\n\s*{re.escape(next_label)}\s*:|\Z)"
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
    cleaned = _clean_text(raw_text)
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
    weaknesses = _dedupe_keep_order(
        [_extract_competency_note(cleaned, key, "falha principal") for key in VALID_COMPETENCY_KEYS]
    )
    improvement_plan = _dedupe_keep_order(
        [_extract_competency_note(cleaned, key, "por que nao recebeu a nota acima") for key in VALID_COMPETENCY_KEYS]
    )

    if not strengths:
        strengths = ["Boa base identificada em pelo menos uma competencia, mas a correcao precisa ser lida junto dos comentarios."]
    if not weaknesses:
        weaknesses = ["A correcao nao destacou falhas de forma limpa o suficiente para resumir melhor."]
    if not improvement_plan:
        improvement_plan = [
            "Revise os comentarios de cada competencia e priorize o primeiro ponto que impediu uma nota mais alta."
        ]

    confidence_match = re.search(
        r"GRAU DE CONFIAN[ÇC]A\s*:?\s*(.+)",
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

    estimated_input = estimate_tokens(prompt.text) + estimate_tokens(payload.theme) + estimate_tokens(payload.essay_text)
    if estimated_input >= _essay_correction_token_limit():
        raise EssayCorrectionError("A redacao ficou grande demais para o limite configurado de tokens da correcao.")

    try:
        result = run_chat_messages(
            task_name="essay_score" if payload.mode == "score_only" else "essay_detailed",
            messages=_compose_correction_messages(prompt, payload),
            temperature=0.1,
        )
    except LLMTaskTimeoutError as exc:
        raise EssayCorrectionTimeoutError(
            "A correcao demorou mais do que o esperado no provider local. Tente novamente ou reduza o tamanho do texto."
        ) from exc
    except LLMTaskConnectionError as exc:
        raise EssayCorrectionUnavailableError(
            "O LM Studio parece offline ou inacessivel no momento. Verifique se o servidor local esta ativo."
        ) from exc
    except LLMTaskResponseError as exc:
        raise EssayCorrectionInvalidResponseError(
            "O modelo respondeu, mas a saida nao veio em formato confiavel para a correcao de redacao."
        ) from exc

    parsed = _parse_correction_output(result.output_text)
    total_tokens = result.tokens_total or (estimated_input + estimate_tokens(result.output_text))
    if total_tokens > _essay_correction_token_limit():
        raise EssayCorrectionInvalidResponseError(
            "A correcao excedeu o limite configurado de tokens e nao foi persistida."
        )

    return result, parsed


def create_essay_correction(payload: EssayCorrectionCreateRequest, session: Session | None = None) -> EssayCorrectionStoredResponse:
    own_session = session is None
    db = session or get_session()
    prompt = load_prompt_file("essay_correction")
    try:
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
    stored = create_essay_correction(
        EssayCorrectionCreateRequest(
            theme=payload.theme,
            essay_text=payload.essay_text,
            student_goal=payload.student_goal,
            mode=payload.mode,
        )
    )
    return EssayCorrectionResponse(
        estimated_score_range=stored.estimated_score_range,
        competencies=stored.competencies,
        strengths=stored.strengths,
        weaknesses=stored.weaknesses,
        improvement_plan=stored.improvement_plan,
        confidence_note=stored.confidence_note,
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
