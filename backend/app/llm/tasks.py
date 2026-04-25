from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from app.llm.client import (
    LLMConnectionError,
    LLMHttpClient,
    LLMHttpStatusError,
    LLMInvalidResponseError,
    LLMTimeoutError,
)
from app.llm.config import get_llm_settings
from app.llm.parsing import LLMParsingError, parse_json_object
from app.llm.providers.lm_studio import (
    LMStudioCompletionResult,
    LMStudioMessage,
    LMStudioProviderError,
    chat_completion,
)
from app.settings import get_env_float


class LLMTaskError(RuntimeError):
    pass


class LLMTaskConnectionError(LLMTaskError):
    pass


class LLMTaskTimeoutError(LLMTaskError):
    pass


class LLMTaskResponseError(LLMTaskError):
    pass


class EssayScorePayload(BaseModel):
    theme: str = Field(min_length=1)
    essay_text: str = Field(min_length=1)
    student_goal: str | None = None
    mode: Literal["score_only", "detailed", "teach"] = "detailed"


class QuestionExplainTextPayload(BaseModel):
    question_text: str = Field(min_length=1)
    student_answer: str | None = None
    desired_style: str | None = None


class LLMTaskResponse(BaseModel):
    task: str
    provider: str
    model: str
    output_text: str
    finish_reason: str | None = None
    tokens_input: int = 0
    tokens_output: int = 0
    tokens_total: int = 0
    raw_response: dict


def _prompt_path(filename: str) -> Path:
    return Path(__file__).resolve().parent / "prompts" / filename


def _load_prompt(filename: str) -> str:
    return _prompt_path(filename).read_text(encoding="utf-8").strip()


def _task_timeout_seconds(task_name: str) -> float:
    timeout_defaults = {
        "question_explain_text": 60.0,
        "essay_score": 600.0,
        "essay_detailed": 900.0,
        "essay_teach": 1080.0,
        "essay_study_chat": 720.0,
    }
    env_names = {
        "question_explain_text": "STUDY_HUB_LLM_TIMEOUT_QUESTION_EXPLAIN_TEXT_SECONDS",
        "essay_score": "STUDY_HUB_LLM_TIMEOUT_ESSAY_SCORE_SECONDS",
        "essay_detailed": "STUDY_HUB_LLM_TIMEOUT_ESSAY_DETAILED_SECONDS",
        "essay_teach": "STUDY_HUB_LLM_TIMEOUT_ESSAY_TEACH_SECONDS",
        "essay_study_chat": "STUDY_HUB_LLM_TIMEOUT_ESSAY_STUDY_CHAT_SECONDS",
    }
    if task_name not in timeout_defaults:
        raise LLMTaskError(f"Tarefa LLM sem timeout configurado: {task_name}")
    return get_env_float(env_names[task_name], timeout_defaults[task_name], minimum=1.0)


def _run_messages(task_name: str, messages: list[LMStudioMessage], temperature: float) -> LLMTaskResponse:
    settings = get_llm_settings()
    client = LLMHttpClient(settings)

    if settings.provider != "lm_studio":
        raise LLMTaskError(f"Provider LLM ainda nao implementado nesta etapa: {settings.provider}")

    try:
        result = chat_completion(
            client=client,
            settings=settings,
            messages=messages,
            temperature=temperature,
            timeout_seconds=_task_timeout_seconds(task_name),
        )
    except LLMTimeoutError as exc:
        raise LLMTaskTimeoutError(str(exc)) from exc
    except LLMConnectionError as exc:
        raise LLMTaskConnectionError(str(exc)) from exc
    except LMStudioProviderError as exc:
        message = str(exc)
        lowered = message.lower()
        if "tempo esgotado" in lowered:
            raise LLMTaskTimeoutError(message) from exc
        connection_markers = (
            "nao foi possivel conectar",
            "offline",
            "inacessivel",
            "encerrou a conexao",
        )
        if any(marker in lowered for marker in connection_markers):
            raise LLMTaskConnectionError(message) from exc
        raise LLMTaskResponseError(message) from exc
    except (LLMInvalidResponseError, LLMHttpStatusError) as exc:
        raise LLMTaskResponseError(str(exc)) from exc

    return _response_from_provider(task_name, result, messages)


def _response_from_provider(
    task_name: str,
    result: LMStudioCompletionResult,
    messages: list[LMStudioMessage],
) -> LLMTaskResponse:
    usage = result.raw_response.get("usage") if isinstance(result.raw_response, dict) else {}
    prompt_tokens = usage.get("prompt_tokens") if isinstance(usage, dict) else None
    completion_tokens = usage.get("completion_tokens") if isinstance(usage, dict) else None
    total_tokens = usage.get("total_tokens") if isinstance(usage, dict) else None
    estimated_input = estimate_messages_tokens(messages)
    estimated_output = estimate_tokens(result.content)
    tokens_input = prompt_tokens if isinstance(prompt_tokens, int) and prompt_tokens >= 0 else estimated_input
    tokens_output = completion_tokens if isinstance(completion_tokens, int) and completion_tokens >= 0 else estimated_output
    tokens_total = total_tokens if isinstance(total_tokens, int) and total_tokens >= 0 else tokens_input + tokens_output
    return LLMTaskResponse(
        task=task_name,
        provider=result.provider,
        model=result.model,
        output_text=result.content,
        finish_reason=result.finish_reason,
        tokens_input=tokens_input,
        tokens_output=tokens_output,
        tokens_total=tokens_total,
        raw_response=result.raw_response,
    )


def estimate_tokens(text: str) -> int:
    cleaned = text.strip()
    if not cleaned:
        return 0
    return max(1, (len(cleaned) + 3) // 4)


def estimate_messages_tokens(messages: list[LMStudioMessage]) -> int:
    # Small per-message overhead keeps the estimate conservative without adding tokenizer dependencies.
    return sum(estimate_tokens(message.content) + 4 for message in messages)


def run_chat_messages(
    *,
    task_name: str,
    messages: list[LMStudioMessage],
    temperature: float = 0.2,
) -> LLMTaskResponse:
    return _run_messages(task_name, messages, temperature=temperature)


def essay_score(payload: EssayScorePayload) -> LLMTaskResponse:
    task_name = {
        "score_only": "essay_score",
        "detailed": "essay_detailed",
        "teach": "essay_teach",
    }[payload.mode]
    system_prompt_file = "essay_score.md" if payload.mode == "score_only" else "essay_detailed.md"
    student_goal = payload.student_goal or "Meta nao informada."
    messages = [
        LMStudioMessage(
            role="system",
            content=_load_prompt(system_prompt_file),
        ),
        LMStudioMessage(
            role="user",
            content=(
                f"Tarefa: corrigir redacao ENEM.\n"
                f"Modo: {payload.mode}\n"
                f"Tema:\n{payload.theme}\n\n"
                f"Objetivo do aluno:\n{student_goal}\n\n"
                f"Importante: a resposta deve ser uma estimativa assistida, nunca uma nota oficial.\n\n"
                f"Redacao do aluno:\n{payload.essay_text}"
            ),
        ),
    ]
    return _run_messages(task_name, messages, temperature=0.1)


def essay_score_structured(payload: EssayScorePayload) -> dict:
    response = essay_score(payload)
    try:
        return parse_json_object(response.output_text)
    except LLMParsingError as exc:
        raise LLMTaskResponseError(
            "O modelo respondeu, mas nao retornou JSON valido para a correcao de redacao."
        ) from exc


def question_explain_text(payload: QuestionExplainTextPayload) -> LLMTaskResponse:
    student_answer_text = payload.student_answer or "Resposta do aluno nao informada."
    desired_style_text = payload.desired_style or "Explique em linguagem clara, enxuta e pedagogica."
    messages = [
        LMStudioMessage(
            role="system",
            content=(
                "Voce explica questoes de vestibular e ENEM em portugues do Brasil. "
                "Priorize raciocinio passo a passo, justificativa da alternativa correta "
                "e alerta breve sobre erros comuns."
            ),
        ),
        LMStudioMessage(
            role="user",
            content=(
                f"Tarefa: explicar questao por texto.\n"
                f"Estilo desejado: {desired_style_text}\n\n"
                f"Questao:\n{payload.question_text}\n\n"
                f"Resposta do aluno:\n{student_answer_text}"
            ),
        ),
    ]
    return _run_messages("question_explain_text", messages, temperature=0.15)
