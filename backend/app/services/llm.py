"""Short text answers from Gemini for the voice co-pilot's free-form questions.

Only used when the deterministic intent parser can't answer. The model gets live lot numbers as context
and strict rules (short, spoken, honest: estimates are estimates, nothing is reserved, no route is "safe").
Returns None on any failure so the caller falls back to a fixed help line.
"""
from __future__ import annotations

import logging
import time

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_CHARS = 320

SYSTEM = """You are WeParkit, a voice assistant for drivers parking at the University at Buffalo North Campus.
Answer in one or two short spoken sentences (under 45 words), no lists, no markdown, no emojis.
Use ONLY the live data provided. Occupancy numbers are estimates, so say "about" or "estimated".
Never say a space is reserved or guaranteed. Never call a route or walkway "safe".
If the question isn't about parking, campus driving, walking conditions, weather or this app,
say briefly that you can help with UB parking, and suggest one example question."""


def configured() -> bool:
    return bool(settings.gemini_api_key.strip())


def answer(question: str, context: str, history: list[tuple[str, str]]) -> str | None:
    if not configured():
        return None
    turns = []
    for q, a in history[-4:]:
        turns += [{"role": "user", "parts": [{"text": q}]}, {"role": "model", "parts": [{"text": a}]}]
    turns.append({"role": "user", "parts": [{"text": f"Live data:\n{context}\n\nDriver asks: {question}"}]})
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": turns,
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 120,
                             **({"thinkingConfig": {"thinkingLevel": settings.gemini_thinking_level}}
                                if settings.gemini_thinking_level else {})},
    }
    headers = {"x-goog-api-key": settings.gemini_api_key.strip()}
    for attempt in range(2):
        try:
            r = httpx.post(ENDPOINT.format(model=settings.gemini_model), headers=headers, json=body, timeout=15)
            if r.status_code in (429, 500, 503) and attempt == 0:
                time.sleep(1.0)
                continue
            r.raise_for_status()
            parts = r.json()["candidates"][0]["content"]["parts"]
            text = " ".join(p.get("text", "") for p in parts).strip().replace("*", "")
            return text[:MAX_CHARS] or None
        except Exception as exc:
            log.warning("Gemini text answer failed: %s", type(exc).__name__)
            return None
    return None
