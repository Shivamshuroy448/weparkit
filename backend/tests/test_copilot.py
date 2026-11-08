import httpx
import pytest

from app.campus import BUILDINGS
from app.services import copilot, voice

B = list(BUILDINGS)


@pytest.mark.parametrize("q,kind,lot", [
    ("Where should I park?", "best", None),
    ("Is Hochstetter full?", "lot_status", "hochstetter-b"),
    ("how many spaces at jarvis", "lot_status", "jarvis-a"),
    ("Is the Center for Tomorrow busy right now", "lot_status", "center-for-tomorrow"),
    ("When should I leave?", "leave_time", None),
    ("when should i leave for stadium", "leave_time", "stadium"),
    ("Take me to Stadium Lot", "directions", "stadium"),
    ("navigate", "directions", None),
    ("Is it icy out?", "conditions", None),
    ("is ice season on", "conditions", None),
    ("any icy walkways?", "hazards", None),
    ("tell me a joke", "help", None),
    ("", "help", None),
])
def test_parse(q, kind, lot):
    i = copilot.parse(q, B)
    assert (i.kind, i.lot_slug) == (kind, lot)


def test_parse_picks_up_destination():
    assert copilot.parse("where should I park for Capen", B).destination == "Capen Hall"
    assert copilot.parse("best lot for the student union", B).destination == "Student Union"


def test_ask_text_flow_and_say(client):
    r = client.post("/api/voice/ask", data={"text": "Is Hochstetter full?"}).json()
    assert r["intent"] == "lot_status" and r["lot"]["slug"] == "hochstetter-b" and "Hochstetter B" in r["answer"]
    said = client.get(r["speech_path"], params={"text_only": True}).json()
    assert said["text"] == r["answer"]
    assert client.get("/api/voice/say/not-a-token", params={"text_only": True}).status_code == 404


def test_ask_directions_returns_action(client):
    r = client.post("/api/voice/ask", data={"text": "take me to jarvis"}).json()
    assert r["action"] == "directions" and r["lot"]["slug"] == "jarvis-a" and r["lot"]["lat"]


def test_ask_hazards_never_says_safe(client):
    r = client.post("/api/voice/ask", data={"text": "any hazards on the walkways"}).json()
    assert r["intent"] == "hazards" and "safe" not in r["answer"].lower()


def test_ask_audio_needs_key(client):
    r = client.post("/api/voice/ask", files={"file": ("q.m4a", b"\x00\x01", "audio/mp4")})
    assert r.status_code == 503


def test_ask_audio_uses_elevenlabs_stt(client, monkeypatch):
    seen = {}

    def post(url, **kw):
        seen.update(url=url, **kw)
        return httpx.Response(200, json={"text": "Where should I park?"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(voice.settings, "elevenlabs_api_key", "k")
    monkeypatch.setattr(voice.httpx, "post", post)
    r = client.post("/api/voice/ask", files={"file": ("q.m4a", b"fake-audio", "audio/mp4")}).json()
    assert r["transcript"] == "Where should I park?" and r["intent"] == "best"
    assert seen["url"] == voice.STT_URL and seen["data"]["model_id"] == voice.settings.elevenlabs_stt_model
    assert seen["headers"]["xi-api-key"] == "k"


def test_alerts(client):
    assert "Ice season just switched on" in client.get("/api/voice/alert", params={"kind": "ice_on", "text_only": True}).json()["text"]
    t = client.get("/api/voice/alert", params={"kind": "lot_full", "lot_id": 2, "text_only": True}).json()["text"]
    assert t.startswith("Hochstetter B is filling up") and "Try" in t
    assert client.get("/api/voice/alert", params={"kind": "bogus"}).status_code == 422
