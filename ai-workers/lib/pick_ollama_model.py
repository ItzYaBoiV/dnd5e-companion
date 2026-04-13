#!/usr/bin/env python3
"""
Read Ollama GET /api/tags JSON from stdin.
Arg 1: hardware-recommended model name (may be absent on disk).

Exit codes:
  0 — printed exactly one model name to register with LiteLLM
  2 — no models in JSON and no recommended name to pull (fatal)
  3 — models list empty but recommended set → caller should: ollama pull <recommended>
"""
from __future__ import annotations

import json
import sys

# Higher = preferred when multiple models are installed (substring match on name).
# Workers run Ollama — pick the strongest model the user actually pulled.
RANK_PREFIXES: list[str] = [
    "qwen2.5:72b",
    "qwen2.5:32b",
    "deepseek-r1:32b",
    "llama3.3:70b",
    "llama3.1:70b",
    "mixtral:8x7b",
    "deepseek-r1:14b",
    "qwen2.5:14b",
    "qwen2.5:7b",
    "llama3.1:8b",
    "llama3.2",
    "llama3.1",
    "mistral",
    "phi3",
    "gemma2",
    "codellama",
]


def _names(data: object) -> list[str]:
    if not isinstance(data, dict):
        return []
    models = data.get("models")
    if not isinstance(models, list):
        return []
    out: list[str] = []
    for m in models:
        if isinstance(m, dict):
            n = (m.get("name") or "").strip()
            if n:
                out.append(n)
    return out


def _match_preferred(names: list[str], preferred: str) -> str | None:
    if preferred in names:
        return preferred
    for n in names:
        if n.startswith(preferred + "-") or n.startswith(preferred + ":"):
            return n
    return None


def _best_installed(names: list[str]) -> str:
    for tier in RANK_PREFIXES:
        for n in names:
            if n == tier or n.startswith(tier + ":") or n.startswith(tier + "-"):
                return n
    return names[0]


def main() -> None:
    preferred = sys.argv[1].strip() if len(sys.argv) > 1 else ""
    data = json.load(sys.stdin)
    names = _names(data)

    if not names:
        if preferred:
            sys.exit(3)
        sys.exit(2)

    if preferred:
        hit = _match_preferred(names, preferred)
        if hit:
            print(hit)
            return

    print(_best_installed(names))


if __name__ == "__main__":
    main()
