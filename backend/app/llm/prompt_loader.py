from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PromptFile:
    name: str
    path: Path
    text: str
    sha256: str


PROMPT_FILES = {
    "essay_correction": "redacao_correcao.txt",
    "essay_study": "redacao_estudo.txt",
}


class PromptLoadError(RuntimeError):
    pass


def _prompts_root() -> Path:
    return Path(__file__).resolve().parents[3] / "docs" / "prompts"


def load_prompt_file(prompt_name: str) -> PromptFile:
    filename = PROMPT_FILES.get(prompt_name)
    if filename is None:
        raise PromptLoadError(f"Prompt nao mapeado: {prompt_name}")

    path = (_prompts_root() / filename).resolve()
    if not path.exists():
        raise PromptLoadError(f"Prompt nao encontrado em disco: {path}")

    text = path.read_text(encoding="utf-8")
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return PromptFile(name=prompt_name, path=path, text=text, sha256=digest)
