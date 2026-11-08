import time

import httpx
import pytest

from app.services import auth

CID = "123-web.apps.googleusercontent.com"


@pytest.fixture()
def google_on(monkeypatch):
    monkeypatch.setattr(auth.settings, "google_client_ids", CID)


def _fake_tokeninfo(monkeypatch, **claims):
    base = {"aud": CID, "iss": "https://accounts.google.com", "exp": str(int(time.time()) + 600),
            "email": "alex.parks@gmail.com", "email_verified": "true", "sub": "1098", "name": "Alex Parks", "given_name": "Alex"}
    base.update(claims)
    seen = {}

    def get(url, params=None, **kw):
        seen["token"] = params["id_token"]
        return httpx.Response(200, json=base, request=httpx.Request("GET", url))
    monkeypatch.setattr(httpx, "get", get)
    return seen


def test_providers(client, google_on):
    p = client.get("/api/auth/providers").json()
    assert p["google"] is True and p["google_client_ids"] == [CID] and "gmail.com" in p["email_domains"]


def test_google_hidden_when_not_configured(client):
    assert client.get("/api/auth/providers").json()["google"] is False
    assert client.post("/api/auth/google", json={"id_token": "x"}).status_code == 503


def test_google_sign_in_creates_then_reuses_account(client, google_on, monkeypatch):
    seen = _fake_tokeninfo(monkeypatch)
    a = client.post("/api/auth/google", json={"id_token": "tok-1"}).json()
    assert seen["token"] == "tok-1" and a["token"] and a["account"]["email"] == "alex.parks@gmail.com"
    assert a["account"]["email_verified"] and a["account"]["user"]["handle"].startswith("Alex")
    b = client.post("/api/auth/google", json={"id_token": "tok-2"}).json()
    assert b["account"]["id"] == a["account"]["id"]
    # Google-only account has no password
    assert client.post("/api/auth/login", json={"email": "alex.parks@gmail.com", "password": "anything-123"}).status_code == 401


def test_google_links_existing_password_account(client, google_on, monkeypatch):
    s = client.post("/api/auth/signup", json={"email": "alex.parks@gmail.com", "password": "snowday-2026"}).json()
    _fake_tokeninfo(monkeypatch)
    g = client.post("/api/auth/google", json={"id_token": "t"}).json()
    assert g["account"]["id"] == s["account"]["id"]


@pytest.mark.parametrize("claims,status", [
    ({"aud": "someone-elses-app"}, 401),                 # token minted for another app
    ({"iss": "https://evil.example.com"}, 401),
    ({"exp": "100"}, 401),                               # expired
    ({"email_verified": "false"}, 401),
    ({"email": "alex@yahoo.com"}, 422),                  # domain not allowed
])
def test_google_rejects_bad_tokens(client, google_on, monkeypatch, claims, status):
    _fake_tokeninfo(monkeypatch, **claims)
    assert client.post("/api/auth/google", json={"id_token": "t"}).status_code == status


def test_google_rejects_token_google_says_is_invalid(client, google_on, monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda url, **kw: httpx.Response(400, json={"error": "invalid_token"}, request=httpx.Request("GET", url)))
    assert client.post("/api/auth/google", json={"id_token": "forged"}).status_code == 401
