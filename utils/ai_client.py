"""
utils/ai_client.py — Unified AI wrapper.

Priority order:
  1. Ollama (FREE, local) — default, no API key needed
  2. Anthropic Claude (paid API) — fallback if Ollama unavailable

Install Ollama: https://ollama.com  then run:  ollama pull llama3.1
"""
import os
import json
import urllib.request
import urllib.error
from config import cfg


def ask_ai(prompt: str, system: str = "", max_tokens: int = 2048) -> str:
    """Send a prompt to the configured AI backend and return text."""
    backend = cfg.AI_BACKEND.lower()

    if backend == "ollama":
        return _ask_ollama(prompt, system, max_tokens)
    elif backend == "anthropic":
        return _ask_anthropic(prompt, system, max_tokens)
    else:
        # Auto-detect: try Ollama first, fall back to Anthropic
        try:
            return _ask_ollama(prompt, system, max_tokens)
        except Exception:
            if cfg.ANTHROPIC_API_KEY:
                print("⚠️  Ollama unavailable, falling back to Claude...")
                return _ask_anthropic(prompt, system, max_tokens)
            raise RuntimeError(
                "No AI backend available. Install Ollama (https://ollama.com) "
                "or set ANTHROPIC_API_KEY in .env"
            )


def summarize(text: str, instruction: str = "Summarize concisely.") -> str:
    return ask_ai(text, system=instruction)


# ── Ollama (local, free) ─────────────────────────────────────────────────────

def _ask_ollama(prompt: str, system: str, max_tokens: int) -> str:
    """Call Ollama's local REST API (no API key needed)."""
    url = f"{cfg.OLLAMA_HOST}/api/generate"
    full_prompt = f"{system}\n\n{prompt}" if system else prompt
    payload = json.dumps({
        "model": cfg.OLLAMA_MODEL,
        "prompt": full_prompt,
        "stream": False,
        "options": {
            "num_predict": max_tokens,
            "temperature": 0.7,
        },
    }).encode("utf-8")

    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("response", "").strip()
    except urllib.error.URLError as e:
        raise ConnectionError(
            f"Cannot reach Ollama at {cfg.OLLAMA_HOST}. "
            f"Is Ollama running? Start it with: ollama serve\n{e}"
        )


# ── Anthropic Claude (paid API) ──────────────────────────────────────────────

def _ask_anthropic(prompt: str, system: str, max_tokens: int) -> str:
    """Call Anthropic Claude API."""
    import anthropic
    client = anthropic.Anthropic(api_key=cfg.ANTHROPIC_API_KEY)
    kwargs = dict(
        model=cfg.AI_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    if system:
        kwargs["system"] = system
    response = client.messages.create(**kwargs)
    return response.content[0].text
