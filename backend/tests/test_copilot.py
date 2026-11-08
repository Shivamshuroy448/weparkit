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


def test_conversation_follow_ups_and_end(client):
    a = client.post("/api/voice/ask", data={"text": "Is Jarvis B full?"}).json()
    assert a["intent"] == "lot_status" and a["lot"]["slug"] == "jarvis-b" and a["conversation_id"]
    cid = a["conversation_id"]
    b = client.post("/api/voice/ask", data={"text": "When should I leave for it?", "conversation_id": cid}).json()
    assert b["intent"] == "leave_time" and b["conversation_id"] == cid and "Jarvis B" in b["answer"]
    c = client.post("/api/voice/ask", data={"text": "is it full", "conversation_id": cid}).json()
    assert c["intent"] == "lot_status" and c["lot"]["slug"] == "jarvis-b"
    d = client.post("/api/voice/ask", data={"text": "thanks", "conversation_id": cid}).json()
    assert d["end_conversation"] is True and d["intent"] == "end"
    # a fresh conversation has no memory of the lot
    e = client.post("/api/voice/ask", data={"text": "is it full"}).json()
    assert e["intent"] == "help" and e["conversation_id"] != cid


def test_free_form_question_goes_to_gemini_with_live_context(client, monkeypatch):
    from app.services import llm
    seen = {}

    def fake_answer(question, context, history):
        seen.update(question=question, context=context, history=history)
        return "About 40 spaces are open at Slee A right now, by our estimate."

    monkeypatch.setattr(llm, "answer", fake_answer)
    first = client.post("/api/voice/ask", data={"text": "Is Slee A full?"}).json()
    r = client.post("/api/voice/ask", data={"text": "Is it worth driving in today or should I take the bus?",
                                            "conversation_id": first["conversation_id"]}).json()
    assert r["answered_by"] == "gemini" and r["answer"].startswith("About 40")
    assert "UB North Campus has" in seen["context"] and "Most open lots" in seen["context"]
    assert seen["history"] and seen["history"][0][0] == "Is Slee A full?"


def test_free_form_without_gemini_falls_back_to_help(client):
    r = client.post("/api/voice/ask", data={"text": "tell me a joke"}).json()
    assert r["intent"] == "help" and r["answered_by"] == "rules" and "You can ask" in r["answer"]


def test_every_ub_lot_is_recognised_by_name():
    from app.campus import LOTS
    lots = [(l["slug"], l["name"]) for l in LOTS]
    for slug, name in lots:
        assert copilot.find_lot(f"is {name} full", lots) == slug, name


def test_concurrent_conversations_are_thread_safe(client):
    """Many phones talking at once: the shared conversation/answer stores must not race."""
    from concurrent.futures import ThreadPoolExecutor

    def talk(i):
        a = client.post("/api/voice/ask", data={"text": "Is Jarvis A full?"}).json()
        b = client.post("/api/voice/ask", data={"text": "is it full", "conversation_id": a["conversation_id"]}).json()
        return a["conversation_id"] == b["conversation_id"] and b["lot"]["slug"] == "jarvis-a" and \
            client.get(b["speech_path"], params={"text_only": True}).status_code == 200

    with ThreadPoolExecutor(max_workers=16) as pool:
        assert all(pool.map(talk, range(48)))
