"""Build app/ub_lots.json: every named UB North Campus parking lot from OpenStreetMap.

    python -m scripts.import_osm_lots                 # use the committed Overpass snapshot
    python -m scripts.import_osm_lots --fetch         # refresh the snapshot from Overpass first

Source: OpenStreetMap `amenity=parking` in the North Campus bbox (© OpenStreetMap contributors, ODbL).
Lot names were cross-checked against UB's Wayfinder map (maps.buffalo.edu) for the area around Jarvis,
Governors, Ketter and Fronczak. Kept: lots operated by UB (or named UB lots), open to permit holders or
visitors. Dropped: unnamed areas, private/no-access, customer-only retail parking and clinic-patient
parking. Capacities are ESTIMATES from outline area unless OSM tags one, calibrated on the four lots
OSM does tag (median ~33 m2 per stall incl. aisles; Center for Tomorrow: 400 spaces / 12,404 m2).
"""
from __future__ import annotations

import argparse
import json
import math
import re
import statistics
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "data" / "osm" / "overpass_parking_2026-11-07.json"
OUT = ROOT / "app" / "ub_lots.json"
BBOX = (42.988, -78.808, 43.013, -78.770)  # south, west, north, east
MIRRORS = ("https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter",
           "https://overpass.private.coffee/api/interpreter")

# Existing lots keep their slugs (and DB ids) so reports, sessions and tests stay valid.
# (OSM way 639790337 is "Jarvis A Lot"; 639790336 is Jarvis B. The pre-import config had them swapped.)
KEEP_SLUG = {639790337: "jarvis-a", 641259627: "hochstetter-b", 236504982: "center-for-tomorrow", 640138909: "stadium"}
KEEP_NAME = {639790337: "Jarvis A", 641259627: "Hochstetter B", 236504982: "Center for Tomorrow", 640138909: "Stadium Lot"}
# Names OSM leaves unlettered, resolved from UB's Wayfinder map (maps.buffalo.edu): the lot south of White Rd
# directly below Governors C is labelled "Governors A Lot" there.
NAME_OVERRIDE = {640333248: "Governors A"}
# UB lots OSM doesn't tag with operator=University at Buffalo but UB's map shows as UB lots.
UB_ALLOW = {724628436, 236504982}  # Alumni A Lot, Center for Tomorrow Lot
DROP_ACCESS = {"no", "private", "customers"}
DROP_NAME = re.compile(r"clinic|patient", re.I)
RESIDENCE = re.compile(r"^(Governors|Fargo|Red Jacket|Richmond|Spaulding|Porter|Wilkeson|Roosevelt|Evans|Clinton)\b")
EVENT = re.compile(r"Stadium|Arena|Special Event")
PERMIT_LABEL = {"f/s,st": "Faculty/staff and student permits", "st": "Student permit", "f/s": "Faculty/staff permit",
                "visitor": "Visitor (paid)"}


def fetch() -> dict:
    s, w, n, e = BBOX
    q = (f'[out:json][timeout:60];(way["amenity"="parking"]({s},{w},{n},{e});'
         f'relation["amenity"="parking"]({s},{w},{n},{e}););out tags geom;')
    last = None
    for url in MIRRORS:
        try:
            r = httpx.post(url, data={"data": q}, headers={"User-Agent": "WeParkit-hackathon/1.0"}, timeout=90)
            r.raise_for_status()
            return r.json()
        except Exception as exc:  # try the next mirror
            last = exc
    raise SystemExit(f"Overpass unavailable: {last}")


def ring(el: dict) -> list[tuple[float, float]]:
    if el["type"] == "way":
        pts = [(p["lat"], p["lon"]) for p in el.get("geometry", [])]
    else:
        outer = [m for m in el.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
        pts = [(p["lat"], p["lon"]) for p in outer[0]["geometry"]] if outer else []
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts


def area_m2(pts: list[tuple[float, float]]) -> float:
    lat0 = math.radians(sum(p[0] for p in pts) / len(pts))
    xy = [(math.radians(b) * math.cos(lat0) * 6_371_000, math.radians(a) * 6_371_000) for a, b in pts]
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(xy, xy[1:] + xy[:1]))) / 2


def _inside(lat: float, lng: float, pts: list[tuple[float, float]]) -> bool:
    inside = False
    for (y1, x1), (y2, x2) in zip(pts, pts[1:] + pts[:1]):
        if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def interior_point(pts: list[tuple[float, float]]) -> tuple[float, float]:
    """Map pin for a lot: the area centroid if it's inside the outline (L-shaped lots can put it
    outside), else the interior grid point farthest from the edges."""
    # area-weighted centroid
    a = cx = cy = 0.0
    for (y1, x1), (y2, x2) in zip(pts, pts[1:] + pts[:1]):
        f = x1 * y2 - x2 * y1
        a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f
    if abs(a) > 1e-14:
        lng, lat = cx / (3 * a), cy / (3 * a)
        if _inside(lat, lng, pts):
            return round(lat, 6), round(lng, 6)
    lats, lngs = [p[0] for p in pts], [p[1] for p in pts]
    best, best_d = (sum(lats) / len(lats), sum(lngs) / len(lngs)), -1.0
    for i in range(1, 30):
        for j in range(1, 30):
            la = min(lats) + (max(lats) - min(lats)) * i / 30
            ln = min(lngs) + (max(lngs) - min(lngs)) * j / 30
            if _inside(la, ln, pts):
                d = min((la - y) ** 2 + (ln - x) ** 2 for y, x in pts)
                if d > best_d:
                    best, best_d = (la, ln), d
    return round(best[0], 6), round(best[1], 6)


def clean_name(raw: str) -> tuple[str, str | None, bool]:
    """'Alumni B Lot (f/s,st)' -> ('Alumni B', 'f/s,st', False); 'Hochstetter B Lot (f/s,st) Commuter Lot' -> commuter."""
    m = re.search(r"\(([^)]*)\)", raw)
    permit = m.group(1).strip().lower() if m else None
    commuter = "commuter" in raw.lower()
    name = re.sub(r"\([^)]*\)", "", raw)
    name = re.sub(r"\bCommuter Lot\b", "", name, flags=re.I)
    name = re.sub(r"\s+", " ", name).strip()
    base = re.sub(r"\s+Lot$", "", name)
    # Single-word names read better with "Lot" ("Fargo Lot"); lettered ones without ("Alumni B").
    name = base if re.search(r"\s[A-Z]$", base) or " " in base else f"{base} Lot"
    return name, permit, commuter


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true", help="refresh the Overpass snapshot first")
    args = ap.parse_args()
    if args.fetch:
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(json.dumps(fetch()), encoding="utf-8")
    data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    els = data["elements"]

    # Calibrate stall density on lots OSM tags with a capacity.
    dens = [area_m2(ring(e)) / int(e["tags"]["capacity"]) for e in els
            if e["tags"].get("capacity", "").isdigit() and int(e["tags"]["capacity"]) > 10 and len(ring(e)) >= 3]
    m2_per_stall = round(statistics.median(dens), 1)

    lots, seen = [], {}
    for e in els:
        t = e["tags"]
        raw = t.get("name")
        if not raw or t.get("access") in DROP_ACCESS or DROP_NAME.search(raw):
            continue
        # Operator-tagged UB lots only (plus the allowlist). Named lots without it (Beane, Crofts, Helm,
        # Kenefic Place) are nearby non-UB properties.
        if not (t.get("operator") == "University at Buffalo" or e["id"] in UB_ALLOW):
            continue
        pts = ring(e)
        if len(pts) < 3:
            continue
        name, permit, commuter = clean_name(raw)
        if t.get("access") == "yes" and permit is None:
            permit = "visitor"
        name = KEEP_NAME.get(e["id"]) or NAME_OVERRIDE.get(e["id"]) or name
        # Two different OSM lots with the same name ("Richmond"): suffix by position.
        if name in seen:
            other = seen[name]
            lat = sum(p[0] for p in pts) / len(pts)
            first_north = other["lat"] > lat
            other["name"] = f"{name} ({'north' if first_north else 'south'})"
            other["slug"] = slugify(other["name"])
            name = f"{name} ({'south' if first_north else 'north'})"
        a = area_m2(pts)
        cap_tag = t.get("capacity")
        capacity = int(cap_tag) if cap_tag and cap_tag.isdigit() else max(8, round(a / m2_per_stall))
        kind = ("visitor" if permit == "visitor" else "event" if EVENT.search(name)
                else "residence" if RESIDENCE.search(name) else "park_and_ride" if "Tomorrow" in name else "commuter")
        lat, lng = interior_point(pts)
        lot = {
            "slug": KEEP_SLUG.get(e["id"]) or slugify(name), "name": name, "kind": kind,
            "permit": PERMIT_LABEL.get(permit or ""), "commuter": commuter,
            "lat": lat, "lng": lng, "polygon": [[round(a_, 6), round(b_, 6)] for a_, b_ in pts],
            "total_capacity": capacity, "capacity_source": "osm_tag" if cap_tag and cap_tag.isdigit() else "area_estimate",
            "area_m2": round(a), "osm": f"{e['type']}/{e['id']}",
        }
        seen[name] = lot
        lots.append(lot)

    lots.sort(key=lambda l: l["name"])
    OUT.write_text(json.dumps({"source": "OpenStreetMap contributors (ODbL), Overpass snapshot " + SNAPSHOT.stem.split("_")[-1],
                               "m2_per_stall": m2_per_stall, "lots": lots}, indent=1), encoding="utf-8")
    print(f"{len(lots)} UB lots -> {OUT.relative_to(ROOT)}  (calibration {m2_per_stall} m2/stall, "
          f"{sum(l['total_capacity'] for l in lots)} spaces total)")
    for l in lots:
        print(f"  {l['name']:<28} {l['kind']:<14} {l['total_capacity']:>5} {'(OSM)' if l['capacity_source'] == 'osm_tag' else '(est)'}  {l['permit'] or ''}")


if __name__ == "__main__":
    main()
