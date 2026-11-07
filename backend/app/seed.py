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
    if not db.query(ParkingLot).count():
        for cfg in LOTS:
            db.add(ParkingLot(**cfg))
    else:
        # Geometry is configuration, not user data: keep existing DBs in sync with campus.py outlines.
        by_slug = {cfg["slug"]: cfg for cfg in LOTS}
        for lot in db.query(ParkingLot):
            cfg = by_slug.get(lot.slug)
            if cfg and (lot.polygon != cfg["polygon"] or (lot.lat, lot.lng) != (cfg["lat"], cfg["lng"])):
                lot.lat, lot.lng, lot.polygon = cfg["lat"], cfg["lng"], cfg["polygon"]
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
