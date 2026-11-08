"""Crew points, anonymous users and the notification feed."""
from __future__ import annotations

import random
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import CrewContribution, Notification, User
from ..timeutil import iso, utcnow
from .realtime import hub

POINTS = {"scan": 30, "report": 20, "hazard": 50, "verify": 10, "clear": 10,
          "leaving": 5, "assist_request": 0, "assist_help": 20}


def get_or_create_user(db: Session, user_id: int | None) -> User:
    if user_id:
        u = db.get(User, user_id)
        if u:
            return u
    for _ in range(10):
        handle = f"Student {random.randint(1000, 9999)}"
        if not db.scalar(select(User).where(User.handle == handle)):
            break
    u = User(handle=handle, is_anonymous=True)
    db.add(u)
    db.commit()
    return u


def award(db: Session, user: User | None, action: str, ref_id: int | None = None) -> int:
    if user is None:
        return 0
    pts = POINTS.get(action, 0)
    db.add(CrewContribution(user_id=user.id, action=action, points=pts, ref_id=ref_id))
    user.points += pts
    if action in ("scan", "report", "hazard"):
        user.reports_submitted += 1
    if action in ("verify", "clear"):
        user.hazards_verified += 1
    if action == "assist_help":
        user.assists_given += 1
    db.commit()
    hub.publish("crew")
    return pts


def notify(db: Session, kind: str, title: str, body: str = "", lot_id: int | None = None,
           user_id: int | None = None, ttl_min: int | None = None, is_demo: bool = False, **meta) -> Notification:
    n = Notification(kind=kind, title=title, body=body, lot_id=lot_id, user_id=user_id, is_demo=is_demo,
                     expires_at=utcnow() + timedelta(minutes=ttl_min) if ttl_min else None, meta=meta)
    db.add(n)
    db.commit()
    hub.publish("notifications")
    return n


def serialize_notification(n: Notification) -> dict:
    return {"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "lot_id": n.lot_id, "user_id": n.user_id,
            "created_at": iso(n.created_at), "expires_at": iso(n.expires_at), "is_demo": n.is_demo, "meta": n.meta}


def serialize_user(u: User, rank: int | None = None) -> dict:
    return {"id": u.id, "handle": u.handle, "points": u.points, "reports_submitted": u.reports_submitted,
            "hazards_verified": u.hazards_verified, "assists_given": u.assists_given,
            "needs_accessible_routes": u.needs_accessible_routes,
            "accepts_assist_requests": u.accepts_assist_requests, "is_anonymous": u.is_anonymous,
            "is_seed": u.is_seed, "rank": rank}
