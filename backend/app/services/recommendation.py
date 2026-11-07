"""Smart parking recommendation engine. Pure functions, fully unit-tested.

It predicts and informs. It never reserves or holds a space.

Per lot:
  1. Snow-adjusted capacity = total * (1 - snow_blocked_fraction)
  2. Predicted occupancy at arrival = historical profile at arrival, shifted by how far the
     latest observation deviates from history now (the shift decays as arrival gets further away).
  3. Expected open spaces at arrival, then P(at least one open space) under a normal error
     model whose spread grows as observation confidence drops.
  4. Search time grows sharply as the lot nears full; ice season multiplies it.
  5. Walk time from haversine distance x detour factor at a season-dependent pace.
  6. Score = 45% availability probability + 20% headroom + 25% walk + 10% search time.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta


@dataclass
class LotSnapshot:
    slug: str
    name: str
    kind: str
    lat: float
    lng: float
    total_capacity: int
    occupancy_fraction: float          # current, of snow-adjusted capacity
    snow_blocked_fraction: float       # of total capacity
    confidence: float                  # 0..1 for the current observation
    hourly_profile: list[float]
    pending_departures: int = 0
    data_source: str = "seed_model"


@dataclass
class RecParams:
    ice_season: bool = False
    walk_speed_m_per_min: float = 80.0
    ice_walk_speed_m_per_min: float = 60.0
    detour_factor: float = 1.3
    search_multiplier_ice: float = 1.5
    ice_departure_buffer_min: int = 12
    drive_minutes: int = 15
    accessible: bool = False
    blocked_for_accessible: set[str] = field(default_factory=set)


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def profile_at(profile: list[float], hour: float) -> float:
    """Linear interpolation over a 24-value hourly profile (wraps at midnight)."""
    if len(profile) != 24:
        raise ValueError("profile must have 24 values")
    h = hour % 24
    lo = int(math.floor(h))
    hi = (lo + 1) % 24
    t = h - lo
    return profile[lo] * (1 - t) + profile[hi] * t


def predict_occupancy(lot: LotSnapshot, now: datetime, arrival: datetime) -> float:
    now_h = now.hour + now.minute / 60
    arr_h = arrival.hour + arrival.minute / 60
    gap_h = max(0.0, (arrival - now).total_seconds() / 3600)
    deviation = lot.occupancy_fraction - profile_at(lot.hourly_profile, now_h)
    weight = math.exp(-gap_h / 1.5) * lot.confidence
    return min(1.0, max(0.0, profile_at(lot.hourly_profile, arr_h) + deviation * weight))


def p_at_least_one(expected_open: float, capacity: float, confidence: float) -> float:
    sd = max(2.5, capacity * 0.06 * (1.6 - confidence))
    z = (expected_open - 0.5) / sd
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def search_minutes(pred_occ: float, ice: bool, mult: float) -> float:
    base = 1.0 + 7.0 * pred_occ ** 4
    return base * (mult if ice else 1.0)


def resolve_arrival(now: datetime, arrival_hhmm: str) -> datetime:
    try:
        hh, mm = (int(x) for x in arrival_hhmm.split(":"))
        target = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    except (ValueError, AttributeError) as exc:
        raise ValueError("arrival time must be HH:MM (24h)") from exc
    if target < now - timedelta(minutes=5):
        target += timedelta(days=1)
    return target


def evaluate_lot(lot: LotSnapshot, dest: tuple[float, float], now: datetime, arrival: datetime, p: RecParams) -> dict:
    snow_cap = max(0.0, lot.total_capacity * (1 - lot.snow_blocked_fraction))
    pred = predict_occupancy(lot, now, arrival)
    expected_open = snow_cap * (1 - pred)
    if 0 <= (arrival - now).total_seconds() <= 15 * 60:
        expected_open += 0.5 * lot.pending_departures
    prob = p_at_least_one(expected_open, snow_cap, lot.confidence)

    dist = haversine_m(lot.lat, lot.lng, *dest) * p.detour_factor
    pace = p.ice_walk_speed_m_per_min if p.ice_season else p.walk_speed_m_per_min
    walk = dist / pace
    via_shuttle = False
    if lot.kind == "park_and_ride" and walk > 12:
        walk, via_shuttle = 6 + 4 + 3, True   # wait + ride + short walk from stop (estimate)
    search = search_minutes(pred, p.ice_season, p.search_multiplier_ice)

    score = 100 * (0.45 * prob + 0.20 * (1 - pred) + 0.25 * max(0.0, 1 - walk / 25) + 0.10 * max(0.0, 1 - search / 10))
    buffer = p.ice_departure_buffer_min if p.ice_season else 0
    depart = arrival - timedelta(minutes=p.drive_minutes + search + walk + buffer)
    blocked = p.accessible and lot.slug in p.blocked_for_accessible

    if prob >= 0.8:
        label = "LIKELY OPEN"
    elif prob >= 0.45:
        label = "TIGHT"
    else:
        label = "LIKELY FULL"

    return {
        "slug": lot.slug, "name": lot.name, "kind": lot.kind,
        "snow_adjusted_capacity": round(snow_cap),
        "predicted_occupancy": round(pred, 3),
        "expected_open_spaces": max(0, round(expected_open)),
        "availability_probability": round(prob, 3),
        "walk_minutes": round(walk, 1), "walk_distance_m": round(dist),
        "via_shuttle": via_shuttle,
        "search_minutes": round(search, 1),
        "ice_buffer_minutes": buffer,
        "recommended_departure": depart.strftime("%H:%M"),
        "score": round(score, 1) if not blocked else 0.0,
        "label": label,
        "accessible_blocked": blocked,
        "data_source": lot.data_source,
        "confidence": round(lot.confidence, 2),
    }


def recommend(lots: list[LotSnapshot], destination: str, dest_coords: tuple[float, float],
              arrival_hhmm: str, now: datetime, params: RecParams) -> dict:
    if not lots:
        raise ValueError("no lots to evaluate")
    arrival = resolve_arrival(now, arrival_hhmm)
    evals = [evaluate_lot(l, dest_coords, now, arrival, params) for l in lots]
    usable = [e for e in evals if not e["accessible_blocked"]]
    ranked = sorted(usable, key=lambda e: e["score"], reverse=True)
    best = ranked[0] if ranked else None
    backup = ranked[1] if len(ranked) > 1 else None
    return {
        "destination": destination,
        "arrival_time": arrival.strftime("%H:%M"),
        "arrival_iso": arrival.isoformat(),
        "mode": "ice" if params.ice_season else "standard",
        "best": best,
        "backup": backup,
        "all": sorted(evals, key=lambda e: e["score"], reverse=True),
        "explanation": explain(best, backup, destination, params),
        "disclaimer": "A prediction, not a reservation. Spaces are first come, first served.",
    }


def explain(best: dict | None, backup: dict | None, destination: str, p: RecParams) -> str:
    if best is None:
        return "Every lot's accessible route to this destination is blocked by a reported curb-ramp hazard. Choose another destination or check Ice Watch."
    parts = [
        f"{best['name']} has the best balance for {destination}: about {best['expected_open_spaces']} spaces expected at arrival "
        f"({round(best['availability_probability'] * 100)}% chance of at least one), "
        f"{'a shuttle trip of ~' if best['via_shuttle'] else 'a '}{round(best['walk_minutes'])}-minute {'ride' if best['via_shuttle'] else 'walk'}, "
        f"and ~{round(best['search_minutes'])} minutes of circling."
    ]
    if p.ice_season:
        parts.append(f"Ice season is on, so capacity reflects snow-blocked spaces, walking pace is slower, and {p.ice_departure_buffer_min} extra minutes are built into your departure.")
    if best["label"] != "LIKELY OPEN":
        parts.append("Even the top option is tight, so leave early or plan for the backup.")
    if backup:
        parts.append(f"If it fills, {backup['name']} is the backup with ~{backup['expected_open_spaces']} spaces expected.")
    if p.accessible:
        parts.append("Lots whose route to your destination crosses a reported blocked curb ramp were excluded.")
    return " ".join(parts)
