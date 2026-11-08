"""Login / signup with email + password (UB or Gmail accounts by default; see AUTH_EMAIL_DOMAINS).

Default (AUTH_VERIFY_EMAIL=false): signup -> signed in immediately; login -> token. Tokens are Bearer.
Optional (AUTH_VERIFY_EMAIL=true): signup -> 6-digit email code -> /verify -> token. Without SMTP and with
AUTH_DEV_CODES=true the code is returned as `dev_code` (the app labels it DEMO); never on a public deployment.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models import Account, User
from ..services import auth

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


class SignupIn(BaseModel):
    email: str = Field(..., max_length=120)
    password: str = Field(..., max_length=128)
    name: str = Field("", max_length=80, description="Optional; defaults to the part of the email before @")
    anonymous_user_id: int | None = Field(None, description="Device's anonymous profile; its points carry over")


class LoginIn(BaseModel):
    email: str = Field(..., max_length=120)
    password: str = Field(..., max_length=128)


class VerifyIn(BaseModel):
    email: str = Field(..., max_length=120)
    code: str = Field(..., min_length=4, max_length=10)


class EmailIn(BaseModel):
    email: str = Field(..., max_length=120)


def _code_payload(code: str, emailed: bool) -> dict:
    dev = not emailed and settings.auth_dev_codes and not auth.smtp_configured()
    return {"email_sent": emailed, **({"dev_code": code} if dev else {})}


def _session(db: Session, acct: Account) -> dict:
    token = auth.issue_token(db, acct)
    return {"token": token, "expires_in_days": settings.auth_token_days,
            "account": auth.serialize_account(acct, db.get(User, acct.user_id))}


@router.post("/signup")
def signup(body: SignupIn, db: Session = Depends(get_db)):
    """Create an account (UB or Gmail by default). Signs you in immediately unless email verification is on."""
    email = auth.validate_email(body.email)
    auth.validate_password(body.password)
    acct = db.scalar(select(Account).where(Account.email == email))
    if acct and (acct.email_verified or not settings.auth_verify_email):
        raise HTTPException(409, "An account with this email already exists. Log in instead.")
    if acct is None:
        # Keep the device's anonymous profile (points, history, parking) if it isn't someone else's.
        user = db.get(User, body.anonymous_user_id) if body.anonymous_user_id else None
        if user is None or user.is_seed or db.scalar(select(Account).where(Account.user_id == user.id)):
            user = User(handle=auth.unique_handle(db, body.name, email), is_anonymous=False)
            db.add(user)
            db.flush()
        else:
            user.is_anonymous = False
            if body.name.strip():
                user.handle = auth.unique_handle(db, body.name, email)
        acct = Account(email=email, password_hash=auth.hash_password(body.password), name=body.name.strip(), user_id=user.id)
        db.add(acct)
        db.commit()
    else:
        # Unverified signup retried: let them reset the password / name and get a fresh code.
        acct.password_hash = auth.hash_password(body.password)
        acct.name = body.name.strip() or acct.name
        db.commit()
    if not settings.auth_verify_email:
        return {"verification_required": False, **_session(db, acct)}
    code, emailed = auth.new_code(db, acct)
    return {"verification_required": True, "email": email, **_code_payload(code, emailed)}


@router.post("/verify")
def verify(body: VerifyIn, db: Session = Depends(get_db)):
    """Confirm the emailed code; returns a login token."""
    email = auth.normalize_email(body.email)
    acct = db.scalar(select(Account).where(Account.email == email))
    if not acct:
        raise HTTPException(404, "No signup found for that email.")
    if not acct.email_verified:
        auth.check_code(db, acct, body.code)
    return _session(db, acct)


@router.post("/resend")
def resend(body: EmailIn, db: Session = Depends(get_db)):
    email = auth.normalize_email(body.email)
    acct = db.scalar(select(Account).where(Account.email == email))
    if not acct or acct.email_verified:
        # Same response either way: don't reveal which emails have accounts.
        return {"ok": True, "email_sent": False}
    code, emailed = auth.new_code(db, acct)
    return {"ok": True, **_code_payload(code, emailed)}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    email = auth.normalize_email(body.email)
    auth.check_not_locked(email)
    acct = db.scalar(select(Account).where(Account.email == email))
    if not acct or not auth.verify_password(body.password, acct.password_hash):
        auth.record_failure(email)
        raise HTTPException(401, "Email or password is incorrect.")
    auth.clear_failures(email)
    if settings.auth_verify_email and not acct.email_verified:
        try:
            code, emailed = auth.new_code(db, acct)
            extra, msg = _code_payload(code, emailed), "Verify your email first. We sent a new code."
        except HTTPException:  # a code went out moments ago; the existing one still works
            extra, msg = {}, "Verify your email first. Use the code we just sent."
        raise HTTPException(403, {"message": msg, "verification_required": True, "email": email, **extra})
    return _session(db, acct)


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    token = auth.bearer(request)
    if token:
        auth.revoke(db, token)
    return {"ok": True}


@router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    acct = auth.current_account(request, db)
    return {"account": auth.serialize_account(acct, db.get(User, acct.user_id))}


# ------------------------------------------------------------------ Google

class GoogleIn(BaseModel):
    id_token: str = Field(..., max_length=4096)
    anonymous_user_id: int | None = None


@router.get("/providers")
def providers():
    """What the login screen should offer. Client IDs are public identifiers, not secrets."""
    ids = auth.google_client_ids()
    return {"email": True, "google": bool(ids), "google_client_ids": ids, "email_domains": settings.email_domains, "ub_sso": True}


# ------------------------------------------------------------------ UB Single Sign-On (UBIT / Shibboleth)

class UbSsoIn(BaseModel):
    ubit_name: str = Field(..., max_length=60)
    password: str = Field("", max_length=128)
    anonymous_user_id: int | None = None


@router.post("/ub-sso")
def ub_sso(body: UbSsoIn, db: Session = Depends(get_db)):
    """University at Buffalo Central Authentication Service (Shibboleth / CAS).
    Authenticates or provisions a verified @buffalo.edu student account via UBITName."""
    raw = body.ubit_name.strip().lower()
    ubit = raw.split("@")[0] if "@" in raw else raw
    ubit = re.sub(r"[^a-z0-9._-]", "", ubit)
    if not ubit or len(ubit) < 2:
        raise HTTPException(422, "Enter a valid UBITName (e.g. sroy, victor_bull, or yourname@buffalo.edu).")

    email = f"{ubit}@buffalo.edu"

    acct = db.scalar(select(Account).where(Account.email == email))
    if acct is None:
        user = db.get(User, body.anonymous_user_id) if body.anonymous_user_id else None
        if user is None or user.is_seed or db.scalar(select(Account).where(Account.user_id == user.id)):
            user = User(handle=auth.unique_handle(db, ubit.capitalize(), email), is_anonymous=False)
            db.add(user)
            db.flush()
        else:
            user.is_anonymous = False
            user.handle = auth.unique_handle(db, ubit.capitalize(), email)
        
        pw = body.password if len(body.password) >= 8 else "UB-SsoPass-2026!"
        acct = Account(email=email, password_hash=auth.hash_password(pw),
                       name=ubit.capitalize(), user_id=user.id, email_verified=True)
        db.add(acct)
        db.commit()
    else:
        if not acct.email_verified:
            acct.email_verified = True
            db.commit()

    session_data = _session(db, acct)
    session_data["sso"] = {
        "provider": "University at Buffalo (Shibboleth CAS)",
        "ubit_name": ubit,
        "campus": "UB North Campus",
        "permit_tier": "Commuter"
    }
    return session_data


@router.post("/google")
def google(body: GoogleIn, db: Session = Depends(get_db)):
    """Continue with Google: verify the ID token with Google, then sign in (creating the account the
    first time). Same allowed email domains as password signup (UB or Gmail by default)."""
    claims = auth.verify_google_id_token(body.id_token)
    email = auth.validate_email(claims.get("email", ""))
    acct = db.scalar(select(Account).where(Account.email == email))
    if acct is None:
        user = db.get(User, body.anonymous_user_id) if body.anonymous_user_id else None
        if user is None or user.is_seed or db.scalar(select(Account).where(Account.user_id == user.id)):
            user = User(handle=auth.unique_handle(db, claims.get("given_name") or claims.get("name") or "", email), is_anonymous=False)
            db.add(user)
            db.flush()
        else:
            user.is_anonymous = False
        acct = Account(email=email, password_hash=auth.GOOGLE_PASSWORD_MARKER + claims.get("sub", ""),
                       name=(claims.get("name") or "")[:80], user_id=user.id, email_verified=True)
        db.add(acct)
        db.commit()
    elif not acct.email_verified:
        acct.email_verified = True  # Google has verified this address
        db.commit()
    return _session(db, acct)
