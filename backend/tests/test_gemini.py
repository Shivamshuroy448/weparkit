import httpx
import numpy as np

from app.services.vision import gemini


def _ok(url, **kw):
    body = {"candidates": [{"content": {"parts": [{"text": '{"category": "ice", "confidence": 0.9}'}]}}]}
    return httpx.Response(200, json=body, request=httpx.Request("POST", url))


def test_key_sent_in_header_never_in_url(monkeypatch):
    seen = {}

    def post(url, **kw):
        seen.update(url=url, **kw)
        return _ok(url)

    monkeypatch.setattr(gemini.settings, "gemini_api_key", "secret-key")
    monkeypatch.setattr(gemini.httpx, "post", post)
    assert gemini.classify_hazard(np.zeros((8, 8, 3), np.uint8))["category"] == "ice"
    assert "secret-key" not in seen["url"] and "params" not in seen
    assert seen["headers"]["x-goog-api-key"] == "secret-key"


def test_transient_503_is_retried(monkeypatch):
    calls = []

    def post(url, **kw):
        calls.append(1)
        return httpx.Response(503, request=httpx.Request("POST", url)) if len(calls) == 1 else _ok(url)

    monkeypatch.setattr(gemini.settings, "gemini_api_key", "k")
    monkeypatch.setattr(gemini.httpx, "post", post)
    monkeypatch.setattr(gemini.time, "sleep", lambda s: None)
    assert gemini.classify_hazard(np.zeros((8, 8, 3), np.uint8)) is not None and len(calls) == 2


def test_persistent_failure_falls_back(monkeypatch):
    monkeypatch.setattr(gemini.settings, "gemini_api_key", "k")
    monkeypatch.setattr(gemini.httpx, "post", lambda url, **kw: httpx.Response(503, request=httpx.Request("POST", url)))
    monkeypatch.setattr(gemini.time, "sleep", lambda s: None)
    assert gemini.classify_hazard(np.zeros((8, 8, 3), np.uint8)) is None
