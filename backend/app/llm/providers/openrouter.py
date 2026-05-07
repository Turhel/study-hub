from __future__ import annotations

from app.llm.client import LLMClientError, LLMHttpClient
from app.llm.config import LLMSettings
from app.llm.providers.lm_studio import LMStudioCompletionResult, LMStudioMessage


class OpenRouterProviderError(RuntimeError):
    pass


def chat_completion(
    client: LLMHttpClient,
    settings: LLMSettings,
    messages: list[LMStudioMessage],
    temperature: float = 0.2,
    timeout_seconds: float | None = None,
) -> LMStudioCompletionResult:
    if not settings.api_key:
        raise OpenRouterProviderError(
            "OPENROUTER_API_KEY ausente. Configure o secret do OpenRouter antes de habilitar o provider."
        )

    payload = {
        "model": settings.model,
        "messages": [{"role": message.role, "content": message.content} for message in messages],
        "temperature": temperature,
    }

    try:
        response = client.post_json("/chat/completions", payload, timeout_seconds=timeout_seconds)
    except LLMClientError as exc:
        raise OpenRouterProviderError(str(exc)) from exc

    choices = response.data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise OpenRouterProviderError("Resposta do OpenRouter sem choices validos.")

    first_choice = choices[0] or {}
    message = first_choice.get("message") or {}
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise OpenRouterProviderError("Resposta do OpenRouter sem texto utilizavel.")

    return LMStudioCompletionResult(
        provider=settings.provider,
        model=response.data.get("model") or settings.model,
        content=content.strip(),
        finish_reason=first_choice.get("finish_reason"),
        raw_response=response.data,
    )
