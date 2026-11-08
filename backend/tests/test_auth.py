import pytest

from app.services import auth


@pytest.fixture(autouse=True)
def _clear_throttle():
    auth._failures.clear()
    auth._locked_until.clear()


@pytest.fixture()
def verify_on(monkeypatch):
    """The optional email-code flow (AUTH_VERIFY_EMAIL=true)."""
    monkeypatch.setattr(auth.settings, "auth_verify_email", True)


def _signup(client, email="ab123@buffalo.edu", pw="snowday-2026", **kw):
    return client.post("/api/auth/signup", json={"email": email, "password": pw, "name": "Alex", **kw})


def test_password_hashing():
    h = auth.hash_password("snowday-2026")
    assert h.startswith("scrypt$") and "snowday" not in h
    assert auth.verify_password("snowday-2026", h) and not auth.verify_password("snowday-2027", h)
    assert auth.hash_password("snowday-2026") != h  # salted
    assert not auth.verify_password("x", "garbage")


def test_only_ub_and_gmail_emails(client):
    for bad in ["ab@yahoo.com", "ab@buffalo.edu.evil.com", "ab@gmail.co", "ab@mail.gmail.com", "@buffalo.edu", "not-an-email"]:
        assert _signup(client, email=bad).status_code == 422, bad
    assert _signup(client, email="AB123@Buffalo.EDU").status_code == 200  # case-insensitive, stored lowercase
    assert _signup(client, email="alex.parks@gmail.com").status_code == 200


def test_simple_signup_logs_in_immediately(client):
    r = client.post("/api/auth/signup", json={"email": "alex.parks@gmail.com", "password": "snowday-2026"}).json()
    assert r["verification_required"] is False and r["token"] and r["account"]["email"] == "alex.parks@gmail.com"
    assert r["account"]["user"]["handle"].lower().startswith("alex")  # handle from the email when no name given
    h = {"Authorization": f"Bearer {r['token']}"}
    assert client.get("/api/auth/me", headers=h).json()["account"]["email"] == "alex.parks@gmail.com"
    assert client.post("/api/auth/login", json={"email": "alex.parks@gmail.com", "password": "snowday-2026"}).status_code == 200
    assert client.post("/api/auth/signup", json={"email": "alex.parks@gmail.com", "password": "snowday-2026"}).status_code == 409


def test_weak_passwords_rejected(client):
    for pw in ["short", "12345678", "aaaaaaaa"]:
        assert _signup(client, pw=pw).status_code == 422, pw


def test_signup_verify_login_me_logout(client, verify_on):
    r = _signup(client).json()
    assert r["verification_required"] and r["email"] == "ab123@buffalo.edu" and len(r["dev_code"]) == 6
    # can't log in before verifying; gets told to verify
    pending = client.post("/api/auth/login", json={"email": "ab123@buffalo.edu", "password": "snowday-2026"})
    assert pending.status_code == 403 and pending.json()["detail"]["verification_required"]
    assert client.post("/api/auth/verify", json={"email": "ab123@buffalo.edu", "code": "000000"}).status_code == 400
    v = client.post("/api/auth/verify", json={"email": "ab123@buffalo.edu", "code": r["dev_code"]}).json()
    token = v["token"]
    assert v["account"]["email_verified"] and v["account"]["user"]["handle"].startswith("Alex")
    h = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/auth/me", headers=h).json()["account"]["email"] == "ab123@buffalo.edu"
    lg = client.post("/api/auth/login", json={"email": "AB123@buffalo.edu", "password": "snowday-2026"})
    assert lg.status_code == 200 and lg.json()["token"] != token
    assert client.post("/api/auth/logout", headers=h).status_code == 200
    assert client.get("/api/auth/me", headers=h).status_code == 401
    assert _signup(client).status_code == 409  # verified account exists


def test_wrong_password_lockout(client, verify_on):
    r = _signup(client).json()
    client.post("/api/auth/verify", json={"email": "ab123@buffalo.edu", "code": r["dev_code"]})
    for _ in range(5):
        assert client.post("/api/auth/login", json={"email": "ab123@buffalo.edu", "password": "wrong-pass"}).status_code == 401
    # locked now, even with the right password
    assert client.post("/api/auth/login", json={"email": "ab123@buffalo.edu", "password": "snowday-2026"}).status_code == 429


def test_unknown_email_gives_same_error_as_wrong_password(client):
    r = client.post("/api/auth/login", json={"email": "nobody@buffalo.edu", "password": "whatever-123"})
    assert r.status_code == 401 and r.json()["detail"] == "Email or password is incorrect."


def test_code_attempt_limit_and_resend_throttle(client, verify_on):
    _signup(client)
    for _ in range(5):
        client.post("/api/auth/verify", json={"email": "ab123@buffalo.edu", "code": "999999"})
    assert client.post("/api/auth/verify", json={"email": "ab123@buffalo.edu", "code": "999999"}).status_code == 429
    assert client.post("/api/auth/resend", json={"email": "ab123@buffalo.edu"}).status_code == 429  # too soon


def test_anonymous_points_carry_over(client, verify_on):
    anon = client.post("/api/crew/me").json()
    client.post("/api/parking/report", json={"lot_id": 1, "occupancy_pct": 50, "user_id": anon["id"]})
    pts = client.post(f"/api/crew/me?user_id={anon['id']}").json()["points"]
    r = _signup(client, anonymous_user_id=anon["id"]).json()
    v = client.post("/api/auth/verify", json={"email": "ab123@buffalo.edu", "code": r["dev_code"]}).json()
    assert v["account"]["user"]["id"] == anon["id"] and v["account"]["user"]["points"] == pts > 0


def test_token_protects_personal_endpoints(client, verify_on):
    r = _signup(client).json()
    v = client.post("/api/auth/verify", json={"email": "ab123@buffalo.edu", "code": r["dev_code"]}).json()
    mine, h = v["account"]["user"]["id"], {"Authorization": f"Bearer {v['token']}"}
    other = client.post("/api/crew/me").json()["id"]
    assert client.post("/api/parking/checkin", json={"user_id": mine, "lot_id": 1}, headers=h).status_code == 200
    assert client.post("/api/parking/checkin", json={"user_id": other, "lot_id": 1}, headers=h).status_code == 403
    assert client.post("/api/parking/checkout", json={"user_id": mine}, headers={"Authorization": "Bearer bogus"}).status_code == 401
    # /crew/me with a token always returns the token's own profile
    assert client.post(f"/api/crew/me?user_id={other}", headers=h).json()["id"] == mine


def test_auth_required_mode(client, monkeypatch):
    monkeypatch.setattr(auth.settings, "auth_required", True)
    u = client.post("/api/crew/me").json()["id"]
    assert client.post("/api/parking/checkin", json={"user_id": u, "lot_id": 1}).status_code == 401


def test_ub_single_sign_on(client):
    # Test with UBITName
    r = client.post("/api/auth/ub-sso", json={"ubit_name": "sroy"}).json()
    assert r["token"] and r["account"]["email"] == "sroy@buffalo.edu"
    assert r["account"]["email_verified"] is True
    assert r["sso"]["provider"] == "University at Buffalo (Shibboleth CAS)"
    assert r["sso"]["ubit_name"] == "sroy"
    assert r["sso"]["permit_tier"] == "Commuter"

    # Test with full @buffalo.edu address
    r2 = client.post("/api/auth/ub-sso", json={"ubit_name": "victor.bull@buffalo.edu"}).json()
    assert r2["token"] and r2["account"]["email"] == "victor.bull@buffalo.edu"

    # Test invalid UBITName
    bad = client.post("/api/auth/ub-sso", json={"ubit_name": "x"})
    assert bad.status_code == 422
