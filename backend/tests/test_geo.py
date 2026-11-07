import pytest

from app.campus import HAZARD_LOCATIONS, LOTS, OUTLINE_SOURCE
from app.services import geo

OUTLINES = [geo.Outline(l["slug"], l["name"], l["polygon"]) for l in LOTS]
SQUARE = [[0.0, 0.0], [0.0, 0.001], [0.001, 0.001], [0.001, 0.0]]


def test_point_in_polygon_basic():
    assert geo.point_in_polygon(0.0005, 0.0005, SQUARE)
    assert not geo.point_in_polygon(0.002, 0.0005, SQUARE)
    assert not geo.point_in_polygon(0.0, 0.0, [[0, 0], [1, 1]])  # degenerate


def test_distance_to_polygon():
    assert geo.distance_to_polygon_m(0.0005, 0.0005, SQUARE) == 0.0
    d = geo.distance_to_polygon_m(0.0015, 0.0005, SQUARE)  # 0.0005 deg lat north of the top edge
    assert 50 < d < 62


def test_every_lot_pin_is_inside_its_outline():
    for l in LOTS:
        assert geo.point_in_polygon(l["lat"], l["lng"], l["polygon"]), l["slug"]
        m = geo.locate_lot(l["lat"], l["lng"], OUTLINES, accuracy_m=8)
        assert m["key"] == l["slug"] and m["method"] == "inside_outline" and m["confidence"] >= 0.9


def test_osm_outlines_are_labelled():
    assert OUTLINE_SOURCE["jarvis-a"].startswith("osm:")
    assert OUTLINE_SOURCE["stadium"] == "approximate_box"


def test_near_but_outside_matches_with_lower_confidence():
    jarvis = next(l for l in LOTS if l["slug"] == "jarvis-a")
    north = max(p[0] for p in jarvis["polygon"])
    m = geo.locate_lot(north + 0.0003, jarvis["lng"], OUTLINES, accuracy_m=10)  # ~33 m north of the lot
    assert m["key"] == "jarvis-a" and m["method"] == "nearest_outline"
    assert 0.35 <= m["confidence"] < 0.9 and 20 < m["distance_m"] < 45


def test_far_away_matches_nothing():
    m = geo.locate_lot(42.8864, -78.8784, OUTLINES, accuracy_m=10)  # downtown Buffalo
    assert m["key"] is None and m["method"] == "none" and m["confidence"] == 0
    assert len(m["candidates"]) == 3


def test_poor_accuracy_grows_radius_but_capped():
    assert geo.search_radius_m(None) == geo.BASE_RADIUS_M
    assert geo.search_radius_m(100) > geo.BASE_RADIUS_M
    assert geo.search_radius_m(5000) == geo.MAX_RADIUS_M


def test_invalid_coordinates():
    with pytest.raises(ValueError):
        geo.locate_lot(123, 0, OUTLINES)


def test_nearest_place():
    p = HAZARD_LOCATIONS[2]
    assert geo.nearest_place(p["lat"], p["lng"], HAZARD_LOCATIONS)["name"] == p["name"]
    assert geo.nearest_place(42.8864, -78.8784, HAZARD_LOCATIONS) is None
