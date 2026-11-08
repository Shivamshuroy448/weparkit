"""Runs a satellite analysis, combines it with NWS alerts, and applies the ice-season decision."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import SatelliteObservation, SystemState
from ..timeutil import iso
from . import satellite as sat
from . import weather
from .crew import notify
from .ice_season import SatelliteSignal, decide, effective_mode
from .lot_state import get_state
from .realtime import hub

settings = get_settings()


def display_reason(s: SystemState) -> str:
    """`SystemState.reason` always holds the automatic engine's reason; a manual override is
    described on top of it, so clearing the override can never leave stale manual wording."""
    if s.manual_override:
        return f"Manual {s.manual_override} override set from the demo toggle. Not a satellite decision."
    return s.reason or "No satellite analysis yet."


def serialize_state(s: SystemState) -> dict:
    return {
        "mode": s.mode, "auto_mode": s.auto_mode, "decision_source": s.decision_source,
        "manual_override": s.manual_override, "reason": display_reason(s), "demo_active": s.demo_active,
        "eta_minutes": s.eta_minutes, "updated_at": iso(s.updated_at),
        "threshold_minutes": settings.ice_arrival_threshold_min,
        "source_label": {
            "manual_override": "Manual override (DEMO toggle)",
            "demo_storm_replay": "Automatic: satellite engine on DEMO storm replay",
            "satellite_engine": "Automatic: satellite engine",
        }.get(s.decision_source, s.decision_source),
    }


def apply_mode(db: Session, state: SystemState) -> None:
    prev = state.mode
    mode, how = effective_mode(state.auto_mode, state.manual_override)
    state.mode = mode
    if how == "manual_override":
        state.decision_source = "manual_override"
    else:
        state.decision_source = "demo_storm_replay" if state.demo_active else "satellite_engine"
    db.commit()
    if prev != state.mode:
        if state.mode == "ice":
            notify(db, "ice_season", "Ice season is on",
                   f"{serialize_state(state)['source_label']}. {display_reason(state)}", is_demo=state.demo_active or how == "manual_override")
        elif prev == "ice":
            notify(db, "ice_season", "Ice season is off", display_reason(state), is_demo=state.demo_active or how == "manual_override")
    hub.publish("state")
    hub.publish("lots")


def set_manual_override(db: Session, mode: str | None) -> SystemState:
    state = get_state(db)
    state.manual_override = mode  # state.reason stays the engine's own reason (see display_reason)
    apply_mode(db, state)
    return state


def run_analysis(db: Session, scenario: str = "live") -> dict:
    """scenario: live (fall back to simulated quiet) | demo_storm."""
    source_status = None
    if scenario == "demo_storm":
        weather.inject_demo_storm()
        frames = sat.archived_frames() or sat.simulate_frames(storm=True)
        geo = sat.live_geometry() if frames and frames[0].source == sat.SOURCE_ARCHIVE else sat.SIM_GEO
    else:
        frames, err = sat.fetch_live_frames(2)
        geo = sat.live_geometry()
        if not frames:
            source_status = err
            frames, geo = sat.simulate_frames(storm=False, n=3), sat.SIM_GEO

    tr = sat.track(frames, geo)
    last = frames[-1]
    overlay_url = sat.save_image(sat.overlay(last, tr, geo), "overlay")
    is_demo = last.source != sat.SOURCE_LIVE

    for i, f in enumerate(frames):
        pf = tr.per_frame[i]
        db.add(SatelliteObservation(
            source=f.source, acquired_at=f.acquired_at, image_path=f.path,
            overlay_path=overlay_url if f is last else "", band_detected=pf["band_count"] > 0,
            band_count=pf["band_count"], is_demo=is_demo,
            **({"motion_dx_px": tr.dx_px, "motion_dy_px": tr.dy_px, "speed_kph": tr.speed_kph,
                "heading_deg": tr.heading_deg, "moving_toward_buffalo": tr.moving_toward,
                "eta_minutes": tr.eta_minutes,
                "analysis": {"method": tr.method, "distance_km": tr.distance_km}} if f is last else {}),
        ))
    db.commit()

    wx = weather.current()
    decision = decide(SatelliteSignal(tr.band_detected, tr.moving_toward, tr.eta_minutes),
                      wx["winter_alert_active"], settings.ice_arrival_threshold_min)
    state = get_state(db)
    state.demo_active = scenario == "demo_storm"
    state.auto_mode = decision.mode
    state.reason = decision.reason
    state.eta_minutes = tr.eta_minutes
    apply_mode(db, state)
    hub.publish("satellite")

    return {
        "scenario": scenario,
        "source": last.source,
        "source_label": sat.SOURCE_LABELS[last.source],
        "is_simulated": last.source == sat.SOURCE_SIM,
        "live_source_status": source_status,
        "frames": [{"acquired_at": iso(f.acquired_at), "image_url": f.path, "band_count": tr.per_frame[i]["band_count"],
                    "centroid": tr.per_frame[i]["centroid"]} for i, f in enumerate(frames)],
        "overlay_url": overlay_url,
        "track": {"band_detected": tr.band_detected, "band_count": tr.band_count, "speed_kph": tr.speed_kph,
                  "heading_deg": tr.heading_deg, "moving_toward_buffalo": tr.moving_toward,
                  "eta_minutes": tr.eta_minutes, "distance_km": tr.distance_km, "method": tr.method,
                  "dx_px": tr.dx_px, "dy_px": tr.dy_px},
        "decision": {"mode": decision.mode, "reason": decision.reason, "corroborated": decision.corroborated},
        "weather": wx,
        "state": serialize_state(state),
    }


def latest_observations(db: Session, limit: int = 12) -> list[SatelliteObservation]:
    return list(db.scalars(select(SatelliteObservation).order_by(SatelliteObservation.acquired_at.desc(),
                                                                  SatelliteObservation.id.desc()).limit(limit)))
