"""The API must never crash: every failure becomes a JSON error with a request id."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError


@pytest.fixture()
def quiet_client():
    # raise_server_exceptions=False: see the HTTP response a phone would get, like production
    from app.main import app
    from app.seed import reset
    with TestClient(app, raise_server_exceptions=False) as c:
        reset()
        yield c


def test_unexpected_exception_becomes_json_500(quiet_client, monkeypatch):
    from app.routers import parking
    monkeypatch.setattr(parking, "lot_status", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    r = quiet_client.get("/api/parking/lots")
    assert r.status_code == 500 and r.json()["request_id"] and "boom" not in r.text
    assert quiet_client.get("/api/live").json() == {"ok": True}  # process still serving


def test_database_lock_becomes_503(quiet_client, monkeypatch):
    from app.routers import parking

    def locked(*a, **k):
        raise OperationalError("SELECT", {}, Exception("database is locked"))

    monkeypatch.setattr(parking, "get_state", locked)
    r = quiet_client.get("/api/parking/lots")
    assert r.status_code == 503 and r.headers["retry-after"] == "2"


def test_oversized_upload_rejected_before_reading(quiet_client):
    r = quiet_client.post("/api/parking/scan", content=b"x", headers={"content-length": str(50 * 1024 * 1024),
                                                                       "content-type": "application/octet-stream"})
    assert r.status_code == 413


def test_health_reports_degraded_instead_of_failing(quiet_client, monkeypatch):
    from app.services import weather
    monkeypatch.setattr(weather, "current", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("NWS down")))
    r = quiet_client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "degraded" and "weather" in r.json()["degraded"]


def test_validation_errors_are_clean(quiet_client):
    r = quiet_client.get("/api/parking/locate", params={"lat": "abc", "lng": 1})
    assert r.status_code == 422 and r.json()["request_id"]
    assert quiet_client.get("/api/parking/lots/999").status_code == 404


def test_request_id_header_on_every_response(quiet_client):
    r = quiet_client.get("/api/health", headers={"x-request-id": "abc123"})
    assert r.headers["x-request-id"] == "abc123"
