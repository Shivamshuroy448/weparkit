"""National Weather Service integration (api.weather.gov, no key required, needs a User-Agent).

Live alerts for the UB North Campus point + latest observation from KBUF (Buffalo airport).
Cached for 5 minutes. When NWS is unreachable the status says so plainly and no alert is
assumed. During a demo storm replay a clearly-marked DEMO alert is injected.
"""
from __future__ import annotations

import time
from datetime import timedelta

import httpx

from ..config import get_settings
from ..timeutil import iso, utcnow

settings = get_settings()
WINTER_WORDS = ("snow", "winter", "blizzard", "ice", "freez", "sleet", "squall", "wind chill", "cold")

_cache: dict = {"t": 0.0, "data": None}
_demo: dict = {"alert": None, "until": None, "observation": None}


def is_winter_event(event: str) -> bool:
    e = event.lower()
    return any(w in e for w in WINTER_WORDS)


def _fetch_live() -> dict:
    headers = {"User-Agent": settings.nws_user_agent, "Accept": "application/geo+json"}
    t = settings.external_timeout_s
    alerts, obs, errors = [], None, []
    try:
        r = httpx.get("https://api.weather.gov/alerts/active",
                      params={"point": f"{settings.nws_point_lat},{settings.nws_point_lon}"}, headers=headers, timeout=t)
        r.raise_for_status()
        for f in r.json().get("features", []):
            p = f.get("properties", {})
            alerts.append({
                "id": p.get("id"), "event": p.get("event", "Alert"), "headline": p.get("headline") or p.get("event"),
                "severity": p.get("severity"), "onset": p.get("onset"), "ends": p.get("ends") or p.get("expires"),
                "winter": is_winter_event(p.get("event", "")), "demo": False, "source": "NWS",
            })
    except Exception as exc:
        errors.append(f"alerts: {type(exc).__name__}")
    try:
        r = httpx.get(f"https://api.weather.gov/stations/{settings.nws_station}/observations/latest", headers=headers, timeout=t)
        r.raise_for_status()
        p = r.json().get("properties", {})
        wind = (p.get("windSpeed") or {}).get("value")
        obs = {
            "temperature_c": (p.get("temperature") or {}).get("value"),
            "wind_kph": round(wind, 1) if wind is not None else None,
            "condition": p.get("textDescription") or "Unknown",
            "observed_at": p.get("timestamp"),
            "station": settings.nws_station,
        }
    except Exception as exc:
        errors.append(f"observation: {type(exc).__name__}")
    live_ok = not errors or (obs is not None or alerts)
    return {"alerts": alerts, "observation": obs, "errors": errors,
            "source": "nws_live" if live_ok and len(errors) < 2 else "unavailable"}


def current(force: bool = False) -> dict:
    if not settings.weather_live_enabled:
        data = {"alerts": [], "observation": None, "errors": ["Live weather disabled (WEATHER_LIVE_ENABLED=false)"], "source": "unavailable"}
    elif force or time.time() - _cache["t"] > 300 or _cache["data"] is None:
        data = _fetch_live()
        _cache.update(t=time.time(), data=data)
    else:
        data = _cache["data"]

    alerts = list(data["alerts"])
    observation = data["observation"]
    demo_active = bool(_demo["alert"] and _demo["until"] and _demo["until"] > utcnow())
    if demo_active:
        alerts = [_demo["alert"], *alerts]
        observation = _demo["observation"]

    status_label = {
        "nws_live": "National Weather Service: live",
        "unavailable": "National Weather Service unreachable: no alert data, none assumed",
    }[data["source"]]
    if demo_active:
        status_label += " + DEMO storm alert injected"
    return {
        "source": data["source"],
        "source_label": status_label,
        "errors": data["errors"],
        "observation": observation,
        "observation_is_demo": demo_active,
        "alerts": alerts,
        "winter_alert_active": any(a["winter"] for a in alerts),
        "demo_active": demo_active,
        "fetched_at": iso(utcnow()),
    }


def inject_demo_storm(hours: float = 3.0) -> None:
    now = utcnow()
    _demo["alert"] = {
        "id": "demo-lake-effect", "event": "Lake Effect Snow Warning (DEMO)",
        "headline": "DEMONSTRATION ONLY: simulated Lake Effect Snow Warning for Erie County. Not an NWS product.",
        "severity": "Moderate", "onset": iso(now), "ends": iso(now + timedelta(hours=hours)),
        "winter": True, "demo": True, "source": "IceStation demo",
    }
    _demo["observation"] = {"temperature_c": -6.0, "wind_kph": 32.0, "condition": "Light snow (DEMO)",
                            "observed_at": iso(now), "station": "DEMO"}
    _demo["until"] = now + timedelta(hours=hours)


def clear_demo() -> None:
    _demo.update(alert=None, until=None, observation=None)
