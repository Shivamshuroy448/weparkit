"""Database initialisation, seeding and demo reset."""
from __future__ import annotations

from sqlalchemy.orm import Session

from .campus import DEMO_USERS, LOTS
from .database import Base, SessionLocal, engine
from .models import ParkingLot, SystemState, User
from .services import weather


def create_all() -> None:
    Base.metadata.create_all(bind=engine)


def seed(db: Session) -> None:
    # Lot definitions are configuration (app/ub_lots.json via campus.py), not user data: insert lots an
    # existing DB doesn't have yet and keep every configured field in sync. Reports, scans and sessions
    # reference lots by id, which never changes for an existing slug.
    existing = {lot.slug: lot for lot in db.query(ParkingLot)}
    for cfg in LOTS:
        lot = existing.get(cfg["slug"])
        if lot is None:
            db.add(ParkingLot(**cfg))
            continue
        for key, value in cfg.items():
            if getattr(lot, key) != value:
                setattr(lot, key, value)
    if not db.query(User).filter(User.is_seed.is_(True)).count():
        for handle, pts, reports, verified in DEMO_USERS:
            db.add(User(handle=handle, is_anonymous=False, is_seed=True, points=pts,
                        reports_submitted=reports, hazards_verified=verified))
    if db.get(SystemState, 1) is None:
        db.add(SystemState(id=1))
    db.commit()


def reset(db: Session | None = None) -> None:
    """Drops every table, recreates and reseeds. Used by RESET DEMO and init_db --reset."""
    own = db is None
    db = db or SessionLocal()
    try:
        db.close()
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        seed(db)
        weather.clear_demo()
    finally:
        if own:
            db.close()


def init() -> None:
    create_all()
    with SessionLocal() as db:
        seed(db)
