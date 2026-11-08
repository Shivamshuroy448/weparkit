import httpx
import pytest

from app.services import voice


def _rec(**best):
    b = {"name": "Jarvis A", "expected_open_spaces": 42, "recommended_departure": "09:40", "ice_buffer_minutes": 0,
         "data_source": "seed_model", "route": {"status": "unverified"}}
    b.update(best)
    return {"destination": "Davis Hall", "arrival_time": "10:10", "best": b, "backup": {"name": "Stadium Lot"}, "explanation": ""}


def test_briefing_text_is_honest_and_specific():
    t = voice.briefing_text(_rec())
    assert "Jarvis A" in t and "42" in t and "9:40 AM" in t and "10:10 AM" in t
    assert "Stadium Lot" in t
    assert "estimate" in t  # seed-model numbers are never presented as live data
    assert "reserved" not in t.lower() and "safe" not in t.lower()


def test_briefing_text_mentions_ice_and_hazards():
    t = voice.briefing_text(_rec(ice_buffer_minutes=12, data_source="crew_scan", route={"status": "blocked"}))
    assert "12 extra minutes" in t and "curb ramp" in t and "estimate" not in t


def test_briefing_text_without_a_lot():
    assert "couldn't find" in voice.briefing_text({"destination": "Davis Hall", "best": None, "backup": None, "explanation": ""})


def test_voice_disabled_without_key(client):
    assert client.get("/api/voice/status").json()["enabled"] is False
    assert client.get("/api/health").json()["voice_enabled"] is False
    r = client.get("/api/voice/briefing")
    assert r.status_code == 503 and "ELEVENLABS_API_KEY" in r.json()["detail"]


def test_text_only_scripts_work_without_key(client):
    assert "Davis Hall" in client.get("/api/voice/briefing", params={"text_only": True}).json()["text"]
    assert "spaces open" in client.get("/api/voice/lot/1", params={"text_only": True}).json()["text"]
    assert client.get("/api/voice/lot/999").status_code == 404


def test_synthesize_calls_elevenlabs_and_caches(client, monkeypatch):
    calls = []

    def fake_post(url, **kw):
        calls.append((url, kw))
        return httpx.Response(200, content=b"ID3fake-mp3", request=httpx.Request("POST", url))

    monkeypatch.setattr(voice.settings, "elevenlabs_api_key", "test-key")
    monkeypatch.setattr(voice.httpx, "post", fake_post)
    voice._cache.clear()
    r = client.get("/api/voice/lot/1")
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and r.content == b"ID3fake-mp3"
    assert calls[0][1]["headers"]["xi-api-key"] == "test-key"
    assert voice.settings.elevenlabs_voice_id in calls[0][0]
    client.get("/api/voice/lot/1")
    assert len(calls) == 1  # identical text served from cache


def test_synthesize_reports_bad_key(monkeypatch):
    monkeypatch.setattr(voice.settings, "elevenlabs_api_key", "bad")
    monkeypatch.setattr(voice.httpx, "post", lambda url, **kw: httpx.Response(401, request=httpx.Request("POST", url)))
    voice._cache.clear()
    with pytest.raises(voice.VoiceError) as e:
        voice.synthesize("hello")
    assert e.value.status == 502 and "API key" in str(e.value)
