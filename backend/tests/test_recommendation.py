from datetime import datetime

import pytest

from app.services.recommendation import (LotSnapshot, RecParams, haversine_m, p_at_least_one, predict_occupancy,
                                         profile_at, recommend, resolve_arrival)

FLAT = [0.5] * 24
NOW = datetime(2026, 1, 20, 9, 0)
DEST = (43.0027, -78.7871)


def lot(slug, occ, lat=43.0030, lng=-78.7860, cap=200, snow=0.0, conf=0.8, kind="commuter", profile=FLAT):
    return LotSnapshot(slug, slug.title(), kind, lat, lng, cap, occ, snow, conf, profile)


def test_profile_interpolation():
    prof = [i / 23 for i in range(24)]
    assert profile_at(prof, 10.5) == pytest.approx((10 / 23 + 11 / 23) / 2)


def test_prediction_moves_toward_history_as_arrival_recedes():
    l = lot("a", 0.9)
    near = predict_occupancy(l, NOW, NOW.replace(minute=10))
    far = predict_occupancy(l, NOW, NOW.replace(hour=14))
    assert near > far >= 0.5


def test_full_lot_has_low_probability():
    assert p_at_least_one(0, 200, 0.9) < 0.5 < p_at_least_one(40, 200, 0.9)


def test_best_is_emptier_lot_at_similar_distance():
    r = recommend([lot("full", 0.99), lot("open", 0.4)], "Davis Hall", DEST, "09:30", NOW, RecParams())
    assert r["best"]["slug"] == "open" and r["backup"]["slug"] == "full"


def test_snow_reduces_capacity_and_ice_adds_buffer():
    l = lot("a", 0.5, snow=0.2)
    std = recommend([l], "Davis Hall", DEST, "09:30", NOW, RecParams())["best"]
    ice = recommend([l], "Davis Hall", DEST, "09:30", NOW, RecParams(ice_season=True))["best"]
    assert std["snow_adjusted_capacity"] == 160
    assert ice["search_minutes"] > std["search_minutes"]
    assert ice["walk_minutes"] > std["walk_minutes"]
    assert ice["recommended_departure"] < std["recommended_departure"]


def test_accessible_mode_excludes_blocked_routes():
    r = recommend([lot("a", 0.3), lot("b", 0.6)], "Davis Hall", DEST, "09:30", NOW,
                  RecParams(accessible=True, blocked_for_accessible={"a"}))
    assert r["best"]["slug"] == "b"
    assert next(e for e in r["all"] if e["slug"] == "a")["accessible_blocked"]


def test_all_blocked_returns_no_best():
    r = recommend([lot("a", 0.3)], "Davis Hall", DEST, "09:30", NOW, RecParams(accessible=True, blocked_for_accessible={"a"}))
    assert r["best"] is None and "blocked" in r["explanation"]


def test_never_claims_reservation():
    r = recommend([lot("a", 0.3)], "Davis Hall", DEST, "09:30", NOW, RecParams())
    assert "not a reservation" in r["disclaimer"]


def test_arrival_parsing_and_rollover():
    assert resolve_arrival(NOW, "10:00").hour == 10
    assert resolve_arrival(NOW, "07:00").day == 21
    with pytest.raises(ValueError):
        resolve_arrival(NOW, "soon")


def test_haversine_sanity():
    assert 100 < haversine_m(43.0, -78.79, 43.001, -78.79) < 120
