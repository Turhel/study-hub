from __future__ import annotations

import json
import socket
from http.client import RemoteDisconnected
from dataclasses import dataclass
from urllib import error, request

from app.llm.config import LLMSettings


class LLMClientError(RuntimeError):
    pass


class LLMConnectionError(LLMClientError):
    pass


class LLMTimeoutError(LLMClientError):
    pass


class LLMInvalidResponseError(LLMClientError):
    pass


class LLMHttpStatusError(LLMClientError):
    pass


@dataclass(frozen=True)
class LLMHttpResponse:
    status_code: int
    data: dict


class LLMHttpClient:
    def __init__(self, settings: LLMSettings) -> None:
        self.settings = settings

    def post_json(self, path: str, payload: dict, timeout_seconds: float | None = None) -> LLMHttpResponse:
        url = f"{self.settings.base_url.rstrip('/')}/{path.lstrip('/')}"
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.settings.api_key:
            headers["Authorization"] = f"Bearer {self.settings.api_key}"

        body = json.dumps(payload).encode("utf-8")
        req = request.Request(url=url, data=body, headers=headers, method="POST")
        effective_timeout = timeout_seconds or self.settings.timeout_seconds

        try:
            with request.urlopen(req, timeout=effective_timeout) as response:
                raw_body = response.read().decode("utf-8")
                data = json.loads(raw_body) if raw_body else {}
                return LLMHttpResponse(status_code=response.status, data=data)
        except error.HTTPError as exc:
            raw_body = exc.read().decode("utf-8", errors="replace")
            detail = raw_body or exc.reason
            raise LLMHttpStatusError(f"Falha HTTP no provider LLM ({exc.code}): {detail}") from exc
        except error.URLError as exc:
            reason = exc.reason
            if isinstance(reason, (TimeoutError, socket.timeout)):
                raise LLMTimeoutError(
                    f"Tempo esgotado ao chamar o provider LLM em {url} apos {effective_timeout:.0f}s."
                ) from exc
            if isinstance(reason, ConnectionRefusedError):
                raise LLMConnectionError(
                    f"LM Studio parece offline em {self.settings.base_url}. Ative o servidor local OpenAI-compatible."
                ) from exc
            raise LLMConnectionError(f"Nao foi possivel conectar ao provider LLM em {url}: {reason}") from exc
        except (TimeoutError, socket.timeout) as exc:
            raise LLMTimeoutError(
                f"Tempo esgotado ao chamar o provider LLM em {url} apos {effective_timeout:.0f}s."
            ) from exc
        except RemoteDisconnected as exc:
            raise LLMConnectionError(
                "O provider LLM encerrou a conexao antes de responder. Verifique o LM Studio e o modelo carregado."
            ) from exc
        except json.JSONDecodeError as exc:
            raise LLMInvalidResponseError("Resposta HTTP do provider LLM nao era JSON valido.") from exc
