"""Parked / not parked: check-in and check-out of a student's car, and how that moves lot counts."""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import ParkingLot, ParkingSession, User
from ..timeutil import iso, utcnow

SESSION_TTL = timedelta(hours=12)


def active_session(db: Session, user_id: int, now: datetime | None = None) -> ParkingSession | None:
    now = now or utcnow()
    return db.scalars(select(ParkingSession).where(
        ParkingSession.user_id == user_id, ParkingSession.ended_at.is_(None), ParkingSession.expires_at > now,
    ).order_by(ParkingSession.created_at.desc()).limit(1)).first()


def check_in(db: Session, user: User, lot: ParkingLot, source: str, lat: float | None, lng: float | None) -> ParkingSession:
    """One active session per student: checking in elsewhere closes the previous one."""
    now = utcnow()
    prev = active_session(db, user.id, now)
    if prev and prev.lot_id == lot.id:
        if lat is not None and lng is not None:
            prev.car_lat, prev.car_lng = lat, lng
        db.commit()
        return prev
    if prev:
        prev.ended_at, prev.end_source = now, "replaced"
    s = ParkingSession(user_id=user.id, lot_id=lot.id, source=source, car_lat=lat, car_lng=lng, expires_at=now + SESSION_TTL)
    db.add(s)
    db.commit()
    return s


def check_out(db: Session, session: ParkingSession, source: str) -> ParkingSession:
    session.ended_at, session.end_source = utcnow(), source
    db.commit()
    return session


def occupancy_adjustment(db: Session, lot_id: int, since: datetime | None, now: datetime | None = None) -> tuple[int, int]:
    """(cars to add to the occupied estimate, active check-ins) for a lot.

    A crew report is a snapshot, so only changes after it count: check-ins since the report add a car,
    check-outs since the report (of cars parked before it) free one. With no report (seed model) every
    active check-in adds a car and check-outs are already absent from the model.
    """
    now = now or utcnow()
    active_q = select(func.count(ParkingSession.id)).where(
        ParkingSession.lot_id == lot_id, ParkingSession.ended_at.is_(None), ParkingSession.expires_at > now)
    active = db.scalar(active_q) or 0
    if since is None:
        return active, active
    arrived = db.scalar(active_q.where(ParkingSession.created_at > since)) or 0
    left = db.scalar(select(func.count(ParkingSession.id)).where(
        ParkingSession.lot_id == lot_id, ParkingSession.ended_at.is_not(None), ParkingSession.ended_at > since,
        ParkingSession.created_at <= since, ParkingSession.end_source != "replaced")) or 0
    return arrived - left, active


def serialize(s: ParkingSession | None, lot: ParkingLot | None) -> dict | None:
    if not s:
        return None
    return {"id": s.id, "lot": {"id": lot.id, "slug": lot.slug, "name": lot.name, "lat": lot.lat, "lng": lot.lng} if lot else None,
            "source": s.source, "car_lat": s.car_lat, "car_lng": s.car_lng, "started_at": iso(s.created_at),
            "ended_at": iso(s.ended_at), "end_source": s.end_source, "active": s.ended_at is None}
