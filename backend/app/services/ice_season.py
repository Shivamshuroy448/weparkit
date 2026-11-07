"""Ice-season decision engine. Pure functions, fully unit-tested.

Rules (threshold configurable, default 60 min):
  ICE      a snow band is detected, moving toward Buffalo, ETA <= threshold,
           AND a NWS winter alert corroborates it.  (Or a band is already overhead
           with an active winter alert.)
  WATCH    a band is detected, or a winter alert is active, but the ICE rule is not met.
  STANDARD neither.
A manual override always wins and is reported separately from the automatic decision.
"""
from dataclasses import dataclass

STANDARD, WATCH, ICE = "standard", "watch", "ice"
MODES = (STANDARD, WATCH, ICE)


@dataclass(frozen=True)
class SatelliteSignal:
    band_detected: bool
    moving_toward: bool = False
    eta_minutes: float | None = None


@dataclass(frozen=True)
class Decision:
    mode: str
    reason: str
    corroborated: bool


def decide(sat: SatelliteSignal, winter_alert_active: bool, threshold_min: float = 60) -> Decision:
    if threshold_min <= 0:
        raise ValueError("threshold_min must be positive")
    eta = sat.eta_minutes
    approaching = sat.band_detected and sat.moving_toward and eta is not None and eta <= threshold_min
    overhead = sat.band_detected and eta is not None and eta <= 0

    if (approaching or overhead) and winter_alert_active:
        when = "over campus now" if overhead else f"~{round(eta)} min from North Campus"
        return Decision(ICE, f"Snow band {when}, confirmed by an active NWS winter alert.", True)
    if approaching or overhead:
        return Decision(WATCH, f"Snow band ~{max(0, round(eta))} min out, but no NWS winter alert confirms it yet.", False)
    if sat.band_detected and winter_alert_active:
        detail = f"ETA ~{round(eta)} min" if eta is not None else "not heading for campus"
        return Decision(WATCH, f"Snow band detected ({detail}) and a winter alert is active.", True)
    if sat.band_detected:
        return Decision(WATCH, "Cold cloud band detected over the Lake Erie region; monitoring its track.", False)
    if winter_alert_active:
        return Decision(WATCH, "NWS winter alert active; no qualifying snow band seen on satellite yet.", False)
    return Decision(STANDARD, "No snow bands or winter alerts detected.", False)


def effective_mode(auto_mode: str, manual_override: str | None) -> tuple[str, str]:
    """Returns (mode, source). Manual override beats the automatic decision."""
    if manual_override in MODES:
        return manual_override, "manual_override"
    if auto_mode not in MODES:
        raise ValueError(f"unknown mode {auto_mode}")
    return auto_mode, "automatic"
