from __future__ import annotations

from app.llm.client import LLMClientError, LLMHttpClient
from app.llm.config import LLMSettings
from app.llm.providers.lm_studio import LMStudioCompletionResult, LMStudioMessage
from app.settings import get_env_bool


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
    use_json_response_format = get_env_bool("STUDY_HUB_OPENROUTER_RESPONSE_FORMAT_JSON", True)
    if use_json_response_format:
        payload["response_format"] = {"type": "json_object"}

    try:
        response = client.post_json("/chat/completions", payload, timeout_seconds=timeout_seconds)
    except LLMClientError as exc:
        if use_json_response_format and "response_format" in str(exc).casefold():
            payload.pop("response_format", None)
            try:
                response = client.post_json("/chat/completions", payload, timeout_seconds=timeout_seconds)
            except LLMClientError as retry_exc:
                raise OpenRouterProviderError(str(retry_exc)) from retry_exc
        else:
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
