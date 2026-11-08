"""GPS lot identification (pitch slide 4). Pure functions, no DB: unit-tested in tests/test_geo.py.

A phone fix is matched against each lot's outline:
  1. inside an outline                         -> that lot, high confidence
  2. outside, but within a radius of an edge   -> nearest lot, confidence falls with distance
  3. otherwise                                 -> no match; the student picks the lot by hand
GPS in a parking lot is typically good to 5-15 m, but phones report worse near tall buildings,
so the search radius grows with the reported accuracy (capped).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from collections.abc import Sequence

EARTH_M = 6_371_000
BASE_RADIUS_M = 60.0
MAX_RADIUS_M = 150.0
PLACE_RADIUS_M = 150.0


@dataclass(frozen=True)
class Outline:
    key: str          # lot slug
    name: str
    polygon: Sequence[Sequence[float]]  # [[lat, lng], ...]


def _xy(lat: float, lng: float, lat0: float) -> tuple[float, float]:
    return math.radians(lng) * math.cos(lat0) * EARTH_M, math.radians(lat) * EARTH_M


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * EARTH_M * math.asin(math.sqrt(h))


def point_in_polygon(lat: float, lng: float, polygon: Sequence[Sequence[float]]) -> bool:
    """Ray casting on (lng, lat). Fine at campus scale; polygon may be open or closed."""
    inside = False
    n = len(polygon)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        yi, xi = polygon[i][0], polygon[i][1]
        yj, xj = polygon[j][0], polygon[j][1]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def distance_to_polygon_m(lat: float, lng: float, polygon: Sequence[Sequence[float]]) -> float:
    """0 inside, otherwise metres to the nearest edge."""
    if point_in_polygon(lat, lng, polygon):
        return 0.0
    lat0 = math.radians(lat)
    px, py = _xy(lat, lng, lat0)
    best = math.inf
    n = len(polygon)
    for i in range(n):
        ax, ay = _xy(polygon[i][0], polygon[i][1], lat0)
        bx, by = _xy(polygon[(i + 1) % n][0], polygon[(i + 1) % n][1], lat0)
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
        best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    return best


def search_radius_m(accuracy_m: float | None) -> float:
    acc = accuracy_m if accuracy_m and accuracy_m > 0 else 0.0
    return min(MAX_RADIUS_M, max(BASE_RADIUS_M, BASE_RADIUS_M + acc * 0.5))


def locate_lot(lat: float, lng: float, outlines: Sequence[Outline], accuracy_m: float | None = None) -> dict:
    """Returns {key, name, method, distance_m, confidence, radius_m, candidates}. key is None when no lot matches."""
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValueError("Latitude/longitude out of range")
    radius = search_radius_m(accuracy_m)
    ranked = sorted(((distance_to_polygon_m(lat, lng, o.polygon), o) for o in outlines), key=lambda t: t[0])
    candidates = [{"key": o.key, "name": o.name, "distance_m": round(d, 1)} for d, o in ranked[:3]]
    base = {"radius_m": round(radius, 1), "candidates": candidates}
    if not ranked:
        return {**base, "key": None, "name": None, "method": "none", "distance_m": None, "confidence": 0.0}
    d, best = ranked[0]
    if d == 0.0:
        # Inside an outline. Poor accuracy near the edge of another lot lowers confidence.
        rival = ranked[1][0] if len(ranked) > 1 else math.inf
        conf = 0.95 if not accuracy_m or rival > accuracy_m else 0.75
        return {**base, "key": best.key, "name": best.name, "method": "inside_outline", "distance_m": 0.0, "confidence": conf}
    if d <= radius:
        conf = round(max(0.35, 0.85 - 0.5 * d / radius), 2)
        return {**base, "key": best.key, "name": best.name, "method": "nearest_outline", "distance_m": round(d, 1), "confidence": conf}
    return {**base, "key": None, "name": None, "method": "none", "distance_m": round(d, 1), "confidence": 0.0}


def nearest_place(lat: float, lng: float, places: Sequence[dict], max_m: float = PLACE_RADIUS_M) -> dict | None:
    """Nearest named spot ({name, lat, lng}) within max_m, e.g. for pre-filling a hazard report location."""
    best = min(((haversine_m((lat, lng), (p["lat"], p["lng"])), p) for p in places), key=lambda t: t[0], default=None)
    if not best or best[0] > max_m:
        return None
    return {"name": best[1]["name"], "distance_m": round(best[0], 1)}
