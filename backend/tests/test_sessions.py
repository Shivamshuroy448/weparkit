from datetime import timedelta


def _user(client):
    return client.post("/api/crew/me").json()["id"]


def test_checkin_takes_a_space_and_checkout_frees_it(client):
    u = _user(client)
    before = client.get("/api/parking/lots/1").json()
    r = client.post("/api/parking/checkin", json={"user_id": u, "lot_id": 1, "source": "auto", "lat": 43.0, "lng": -78.79}).json()
    assert r["session"]["active"] and r["session"]["lot"]["id"] == 1 and r["session"]["source"] == "auto"
    assert r["lot"]["occupied"] == before["occupied"] + 1 and r["lot"]["checked_in"] == 1
    assert client.get("/api/parking/session", params={"user_id": u}).json()["session"]["car_lat"] == 43.0
    out = client.post("/api/parking/checkout", json={"user_id": u, "source": "auto"}).json()
    assert out["session"]["active"] is False and out["lot"]["occupied"] == before["occupied"]
    assert out["points_awarded"] == 5
    assert client.get("/api/parking/session", params={"user_id": u}).json()["session"] is None
    feed = client.get("/api/notifications").json()["notifications"]
    assert any(n["kind"] == "leaving" and "auto-detected" in n["body"] for n in feed)
    assert client.post("/api/parking/checkout", json={"user_id": u}).status_code == 409


def test_one_active_session_per_student(client):
    u = _user(client)
    client.post("/api/parking/checkin", json={"user_id": u, "lot_id": 1})
    r = client.post("/api/parking/checkin", json={"user_id": u, "lot_id": 2}).json()
    assert r["session"]["lot"]["id"] == 2
    assert client.get("/api/parking/lots/1").json()["checked_in"] == 0
    # re-checking into the same lot keeps the session
    again = client.post("/api/parking/checkin", json={"user_id": u, "lot_id": 2}).json()
    assert again["session"]["id"] == r["session"]["id"]


def test_checkout_after_report_frees_reported_car(client):
    from app.database import SessionLocal
    from app.models import ParkingSession
    u = _user(client)
    client.post("/api/parking/checkin", json={"user_id": u, "lot_id": 1})
    with SessionLocal() as db:  # pretend the car parked an hour ago, before the report
        for s in db.query(ParkingSession).all():
            s.created_at -= timedelta(hours=1)
        db.commit()
    rep = client.post("/api/parking/report", json={"lot_id": 1, "occupancy_pct": 50}).json()["lot"]
    out = client.post("/api/parking/checkout", json={"user_id": u}).json()["lot"]
    assert out["occupied"] == rep["occupied"] - 1


def test_checkin_validation(client):
    u = _user(client)
    assert client.post("/api/parking/checkin", json={"user_id": u, "lot_id": 999}).status_code == 404
    assert client.post("/api/parking/checkin", json={"user_id": 99999, "lot_id": 1}).status_code == 404
    assert client.post("/api/parking/checkin", json={"user_id": u, "lot_id": 1, "source": "teleport"}).status_code == 422
