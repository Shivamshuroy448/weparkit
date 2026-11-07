"""Configurable seed geography for UB North Campus.

Coordinates are approximate and hand-placed for the prototype. Capacities and hourly
occupancy profiles are PROTOTYPE SEED ESTIMATES, not official UB Parking data. Edit
freely; `python -m scripts.init_db --reset` reloads them.
"""

# Typical weekday occupancy fraction by hour (0-23). Commuter lots fill with morning lectures.
_COMMUTER = [0.05, 0.04, 0.04, 0.04, 0.05, 0.08, 0.15, 0.35, 0.62, 0.84, 0.93, 0.95,
             0.92, 0.90, 0.88, 0.80, 0.66, 0.48, 0.32, 0.25, 0.18, 0.12, 0.08, 0.06]
_COMMUTER_HOT = [0.05, 0.04, 0.04, 0.04, 0.05, 0.10, 0.20, 0.45, 0.75, 0.95, 0.99, 0.99,
                 0.97, 0.95, 0.92, 0.85, 0.70, 0.50, 0.33, 0.25, 0.18, 0.12, 0.08, 0.06]
_PARK_RIDE = [0.03, 0.03, 0.03, 0.03, 0.04, 0.06, 0.10, 0.22, 0.40, 0.58, 0.68, 0.72,
              0.70, 0.68, 0.65, 0.58, 0.45, 0.32, 0.20, 0.14, 0.10, 0.07, 0.05, 0.04]
_STADIUM = [0.02, 0.02, 0.02, 0.02, 0.03, 0.05, 0.08, 0.16, 0.30, 0.44, 0.52, 0.56,
            0.55, 0.54, 0.52, 0.46, 0.36, 0.25, 0.16, 0.12, 0.08, 0.05, 0.04, 0.03]


def _box(lat: float, lng: float, dlat: float, dlng: float) -> list[list[float]]:
    return [[lat - dlat, lng - dlng], [lat - dlat, lng + dlng], [lat + dlat, lng + dlng], [lat + dlat, lng - dlng]]


LOTS = [
    {
        "slug": "jarvis-a", "name": "Jarvis A", "kind": "commuter",
        "description": "Commuter lot by the engineering quad",
        "lat": 43.0036, "lng": -78.7856, "total_capacity": 220, "total_rows": 6,
        "hourly_profile": _COMMUTER,
    },
    {
        "slug": "hochstetter-b", "name": "Hochstetter B", "kind": "commuter",
        "description": "Commuter lot near the Natural Sciences Complex",
        "lat": 42.9997, "lng": -78.7910, "total_capacity": 180, "total_rows": 5,
        "hourly_profile": _COMMUTER_HOT,
    },
    {
        "slug": "center-for-tomorrow", "name": "Center for Tomorrow", "kind": "park_and_ride",
        "description": "Park and ride on Flint Road with shuttle to the Spine",
        "lat": 43.0062, "lng": -78.7966, "total_capacity": 400, "total_rows": 10,
        "hourly_profile": _PARK_RIDE,
    },
    {
        "slug": "stadium", "name": "Stadium Lot", "kind": "park_and_ride",
        "description": "Large lot beside UB Stadium",
        "lat": 42.9994, "lng": -78.7768, "total_capacity": 650, "total_rows": 14,
        "hourly_profile": _STADIUM,
    },
]
# Real lot outlines traced from OpenStreetMap (© OpenStreetMap contributors, ODbL), fetched 2026-11-07
# via Overpass `amenity=parking`. Jarvis and Hochstetter are name matches; Center for Tomorrow is the
# large lot beside it on Flint Rd (unnamed in OSM, matched by proximity). The Stadium Lot had no OSM
# parking outline within ~270 m of its seed point, so it keeps an approximate box. `center` is the
# OSM bounding-box centre and replaces the hand-placed pin.
OSM_OUTLINES = {
    "jarvis-a": {"osm_way": 639790336, "center": (43.00385, -78.78697),
        "polygon": [[43.004266, -78.78758], [43.00427, -78.786357], [43.003479, -78.786353], [43.003479, -78.786388], [43.003434, -78.786387], [43.00343, -78.787575]]},
    "hochstetter-b": {"osm_way": 641259627, "center": (42.99877, -78.79041),
        "polygon": [[42.998184, -78.790761], [42.998187, -78.789819], [42.999361, -78.789826], [42.999355, -78.791], [42.999206, -78.790999], [42.99833, -78.790992], [42.998227, -78.790991], [42.998229, -78.79083], [42.998229, -78.790818], [42.998227, -78.790807], [42.998224, -78.790797], [42.99822, -78.790787], [42.998214, -78.790779], [42.998208, -78.790772], [42.9982, -78.790766], [42.998193, -78.790762]]},
    "center-for-tomorrow": {"osm_way": 669542495, "center": (43.00772, -78.79732),
        "polygon": [[43.007645, -78.797997], [43.008336, -78.798012], [43.008402, -78.797564], [43.008407, -78.797], [43.007415, -78.796975], [43.007407, -78.796927], [43.007378, -78.796372], [43.007104, -78.796371], [43.007101, -78.796516], [43.007099, -78.796669], [43.007152, -78.79667], [43.007149, -78.796974], [43.007036, -78.796973], [43.007028, -78.797962], [43.007101, -78.797962], [43.007102, -78.798269], [43.007345, -78.798269], [43.007348, -78.798002], [43.007433, -78.798004], [43.007438, -78.797418], [43.00765, -78.797422]]},
}

# slug -> "osm:<way id>" or "approximate_box"; exposed by /api/parking/locate so the UI can be honest.
OUTLINE_SOURCE: dict[str, str] = {}
for _lot in LOTS:
    _osm = OSM_OUTLINES.get(_lot["slug"])
    if _osm:
        _lot["lat"], _lot["lng"] = _osm["center"]
        _lot["polygon"] = _osm["polygon"]
        OUTLINE_SOURCE[_lot["slug"]] = f"osm:{_osm['osm_way']}"
    else:
        _lot["polygon"] = _box(_lot["lat"], _lot["lng"], 0.00045, 0.0008)
        OUTLINE_SOURCE[_lot["slug"]] = "approximate_box"

BUILDINGS = {
    "Davis Hall": (43.0027, -78.7871),
    "Capen Hall": (43.0009, -78.7893),
    "Student Union": (43.0010, -78.7863),
    "Knox Hall": (43.0006, -78.7875),
    "Lockwood Library": (43.0003, -78.7864),
    "Natural Sciences Complex": (43.0007, -78.7882),
    "Furnas Hall": (43.0019, -78.7869),
    "Center for the Arts": (43.0011, -78.7836),
    "Alumni Arena": (43.0003, -78.7808),
}

# Named spots students pick when filing a walkway report.
HAZARD_LOCATIONS = [
    {"name": "Jarvis A to Davis Hall walkway", "lat": 43.0033, "lng": -78.7870},
    {"name": "Davis Hall north curb ramp", "lat": 43.0028, "lng": -78.7869},
    {"name": "Capen Hall ramp", "lat": 43.0008, "lng": -78.7889},
    {"name": "Academic Spine by Student Union", "lat": 43.0011, "lng": -78.7867},
    {"name": "Hochstetter B crosswalk", "lat": 42.9995, "lng": -78.7900},
    {"name": "Lockwood Library ramp", "lat": 43.0002, "lng": -78.7861},
    {"name": "Stadium Lot path to Alumni Arena", "lat": 42.9998, "lng": -78.7789},
    {"name": "Center for Tomorrow shuttle stop", "lat": 43.0071, "lng": -78.7962},
    {"name": "Knox Hall plaza", "lat": 43.0005, "lng": -78.7877},
]

DEMO_USERS = [
    ("Cadet Nova", 1240, 31, 18),
    ("Cadet Orbit", 980, 24, 15),
    ("Cadet Polaris", 760, 19, 9),
    ("Cadet Lumen", 540, 12, 11),
    ("Cadet Vega", 310, 8, 4),
]
