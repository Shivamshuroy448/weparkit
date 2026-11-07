import pytest

from app.services.ice_season import ICE, STANDARD, WATCH, SatelliteSignal, decide, effective_mode


def test_standard_when_nothing_detected():
    assert decide(SatelliteSignal(False), False).mode == STANDARD


def test_ice_when_band_approaching_and_corroborated():
    d = decide(SatelliteSignal(True, True, 45), True, 60)
    assert d.mode == ICE and d.corroborated


def test_watch_when_band_approaching_without_alert():
    d = decide(SatelliteSignal(True, True, 30), False, 60)
    assert d.mode == WATCH and not d.corroborated


def test_watch_when_band_beyond_threshold_even_with_alert():
    assert decide(SatelliteSignal(True, True, 95), True, 60).mode == WATCH


def test_threshold_is_configurable():
    sig = SatelliteSignal(True, True, 95)
    assert decide(sig, True, 120).mode == ICE
    assert decide(sig, True, 60).mode == WATCH


def test_band_moving_away_is_watch():
    assert decide(SatelliteSignal(True, False, None), True).mode == WATCH


def test_alert_alone_is_watch():
    assert decide(SatelliteSignal(False), True).mode == WATCH


def test_band_overhead_with_alert_is_ice():
    assert decide(SatelliteSignal(True, True, 0), True).mode == ICE


def test_manual_override_wins_and_is_labelled():
    assert effective_mode(STANDARD, ICE) == (ICE, "manual_override")
    assert effective_mode(ICE, None) == (ICE, "automatic")


def test_invalid_threshold():
    with pytest.raises(ValueError):
        decide(SatelliteSignal(True, True, 10), True, 0)
