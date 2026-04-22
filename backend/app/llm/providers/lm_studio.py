from __future__ import annotations

from dataclasses import dataclass

from app.llm.client import LLMClientError, LLMHttpClient
from app.llm.config import LLMSettings


class LMStudioProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class LMStudioMessage:
    role: str
    content: str


@dataclass(frozen=True)
class LMStudioCompletionResult:
    provider: str
    model: str
    content: str
    finish_reason: str | None
    raw_response: dict


def chat_completion(
    client: LLMHttpClient,
    settings: LLMSettings,
    messages: list[LMStudioMessage],
    temperature: float = 0.2,
    timeout_seconds: float | None = None,
) -> LMStudioCompletionResult:
    payload = {
        "model": settings.model,
        "messages": [{"role": message.role, "content": message.content} for message in messages],
        "temperature": temperature,
    }

    try:
        response = client.post_json("/chat/completions", payload, timeout_seconds=timeout_seconds)
    except LLMClientError as exc:
        raise LMStudioProviderError(str(exc)) from exc

    choices = response.data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise LMStudioProviderError("Resposta do LM Studio sem choices validos.")

    first_choice = choices[0] or {}
    message = first_choice.get("message") or {}
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise LMStudioProviderError("Resposta do LM Studio sem texto utilizavel.")

    return LMStudioCompletionResult(
        provider=settings.provider,
        model=response.data.get("model") or settings.model,
        content=content.strip(),
        finish_reason=first_choice.get("finish_reason"),
        raw_response=response.data,
    )
