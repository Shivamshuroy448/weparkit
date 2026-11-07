from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..campus import BUILDINGS, HAZARD_LOCATIONS
from ..config import get_settings
from ..database import get_db
from ..schemas import ModeIn
from ..seed import reset
from ..services import satellite as sat
from ..services import weather
from ..services.engine import latest_observations, run_analysis, serialize_state, set_manual_override
from ..services.lot_state import campus_now, get_state
from ..services.realtime import hub
from ..timeutil import iso

settings = get_settings()
weather_router = APIRouter(prefix="/api/weather", tags=["weather"])
satellite_router = APIRouter(prefix="/api/satellite", tags=["satellite"])
system_router = APIRouter(prefix="/api", tags=["system"])


@weather_router.get("/current")
def weather_current(refresh: bool = False):
    return weather.current(force=refresh)


@satellite_router.get("/status")
def satellite_status(db: Session = Depends(get_db)):
    listing, err = sat.live_listing()
    obs = latest_observations(db)
    latest = obs[0] if obs else None
    analysed = next((o for o in obs if o.overlay_path), None)
    return {
        "satellite": {"name": "NOAA GOES-19", "alias": "GOES-East", "altitude_km": 35786, "longitude": "75.2° W",
                      "instrument": "ABI band 13 (10.3 µm clean longwave IR)", "cadence": "new sector image every few minutes"},
        "live_feed": {
            "online": bool(listing), "error": err,
            "latest_acquired_at": iso(listing[-1][0]) if listing else None,
            "latest_image_url": listing[-1][1] if listing else None,
            "label": sat.SOURCE_LABELS[sat.SOURCE_LIVE] if listing else "SIMULATED SATELLITE FEED in use (live GOES-19 unreachable)",
        },
        "latest_observation": _obs(latest) if latest else None,
        "latest_analysis": _obs(analysed) if analysed else None,
        "timeline": [_obs(o) for o in obs],
        "state": serialize_state(get_state(db)),
        "threshold_minutes": settings.ice_arrival_threshold_min,
    }


def _obs(o) -> dict:
    return {"id": o.id, "source": o.source, "source_label": sat.SOURCE_LABELS.get(o.source, o.source),
            "acquired_at": iso(o.acquired_at), "image_url": o.image_path, "overlay_url": o.overlay_path or None,
            "band_detected": o.band_detected, "band_count": o.band_count, "speed_kph": o.speed_kph,
            "heading_deg": o.heading_deg, "moving_toward_buffalo": o.moving_toward_buffalo,
            "eta_minutes": o.eta_minutes, "is_demo": o.is_demo, "analysis": o.analysis}


@satellite_router.post("/analyze")
def satellite_analyze(db: Session = Depends(get_db)):
    """Pull the newest GOES-19 frames (falls back to a labelled simulated quiet feed) and run the engine."""
    return run_analysis(db, "live")


@satellite_router.post("/demo-storm")
def satellite_demo_storm(db: Session = Depends(get_db)):
    """DEMO: replays a lake-effect storm (archived frames if present, else simulated) through the real pipeline."""
    return run_analysis(db, "demo_storm")


@system_router.get("/state")
def system_state(db: Session = Depends(get_db)):
    return serialize_state(get_state(db))


@system_router.post("/state/mode")
def system_mode(body: ModeIn, db: Session = Depends(get_db)):
    """DEMO toggle. Sets or clears a manual override, reported separately from satellite decisions."""
    return serialize_state(set_manual_override(db, body.mode))


@system_router.post("/demo/reset")
def demo_reset(db: Session = Depends(get_db)):
    reset(db)
    for ev in ("state", "lots", "hazards", "notifications", "crew", "satellite"):
        hub.publish(ev)
    return {"ok": True, "message": "Demo reset: database reseeded, demo weather cleared."}


@system_router.get("/meta")
def meta():
    now, simulated = campus_now()
    return {
        "buildings": [{"name": k, "lat": v[0], "lng": v[1]} for k, v in BUILDINGS.items()],
        "hazard_locations": HAZARD_LOCATIONS,
        "campus_center": [43.0012, -78.7880],
        "campus_time": now.strftime("%H:%M"), "simulated_clock": simulated,
        "config": {"parking_report_ttl_min": settings.parking_report_ttl_min,
                   "ice_hazard_ttl_hours": settings.ice_hazard_ttl_hours,
                   "ice_arrival_threshold_min": settings.ice_arrival_threshold_min,
                   "ice_capacity_reduction_default": settings.ice_capacity_reduction_default,
                   "ice_departure_buffer_min": settings.ice_departure_buffer_min},
    }
