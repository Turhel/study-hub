from __future__ import annotations

import json


class LLMParsingError(RuntimeError):
    pass


def parse_json_object(raw_text: str) -> dict:
    candidates = _candidate_texts(raw_text)

    for candidate in candidates:
        parsed = _try_parse_dict(candidate)
        if parsed is not None:
            return parsed

    for candidate in candidates:
        extracted = _extract_first_json_object(candidate)
        if extracted is not None:
            return extracted

    raise LLMParsingError("O modelo nao retornou um JSON valido para esta tarefa.")


def _candidate_texts(raw_text: str) -> list[str]:
    text = raw_text.strip()
    if not text:
        return [""]

    candidates = [text]
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3:
            inner = "\n".join(lines[1:-1]).strip()
            if inner and inner not in candidates:
                candidates.append(inner)
    return candidates


def _try_parse_dict(text: str) -> dict | None:
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _extract_first_json_object(text: str) -> dict | None:
    start_index: int | None = None
    depth = 0
    in_string = False
    escaped = False

    for index, char in enumerate(text):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue

        if char == "{":
            if depth == 0:
                start_index = index
            depth += 1
            continue

        if char == "}":
            if depth == 0:
                continue
            depth -= 1
            if depth == 0 and start_index is not None:
                candidate = text[start_index : index + 1]
                parsed = _try_parse_dict(candidate)
                if parsed is not None:
                    return parsed
                start_index = None

    return None
