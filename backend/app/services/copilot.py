"""Voice co-pilot intent parsing (pure, no DB, unit-tested).

Driving questions are short and predictable, so a deterministic keyword parser is faster and more
reliable than an LLM here: "Where should I park?", "Is Hochstetter full?", "When should I leave?",
"Take me to Stadium", "Is it icy?". Anything else gets a short spoken help line.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# Spoken aliases -> lot slug. Speech-to-text often drops letters ("Jarvis A" -> "Jarvis").
LOT_ALIASES = {
    "jarvis": "jarvis-a",
    "hochstetter": "hochstetter-b", "hoffstetter": "hochstetter-b", "hochstatter": "hochstetter-b", "hockstetter": "hochstetter-b",
    "center for tomorrow": "center-for-tomorrow", "centre for tomorrow": "center-for-tomorrow", "tomorrow": "center-for-tomorrow",
    "stadium": "stadium",
}

KINDS = ("directions", "lot_status", "leave_time", "best", "conditions", "hazards", "help")


@dataclass(frozen=True)
class Intent:
    kind: str                        # one of KINDS
    lot_slug: str | None = None      # lot the question is about, if any
    destination: str | None = None   # building named in the question, if any


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", text.lower()).strip()


def _has(t: str, *words: str) -> bool:
    return any(re.search(rf"\b{re.escape(w)}\b", t) for w in words)


def find_lot(text: str) -> str | None:
    t = _norm(text)
    # longest alias first so "center for tomorrow" wins over "tomorrow"
    for alias in sorted(LOT_ALIASES, key=len, reverse=True):
        if re.search(rf"\b{re.escape(alias)}\b", t):
            return LOT_ALIASES[alias]
    return None


def find_building(text: str, buildings: list[str]) -> str | None:
    t = _norm(text)
    for b in sorted(buildings, key=len, reverse=True):
        name = _norm(b)
        short = name.replace(" hall", "").replace(" library", "").replace(" complex", "").strip()
        if re.search(rf"\b{re.escape(name)}\b", t) or (len(short) > 3 and re.search(rf"\b{re.escape(short)}\b", t)):
            return b
    return None


def parse(text: str, buildings: list[str]) -> Intent:
    t = _norm(text)
    lot = find_lot(t)
    dest = find_building(t, buildings)
    if not t:
        return Intent("help")
    if _has(t, "directions", "navigate", "navigation", "take me", "route me", "drive me", "get me to", "how do i get"):
        return Intent("directions", lot, dest)
    if lot and _has(t, "full", "space", "spaces", "spot", "spots", "open", "room", "busy", "available", "parking", "how many", "is", "status"):
        return Intent("lot_status", lot, dest)
    if _has(t, "when", "leave", "time", "late", "depart"):
        return Intent("leave_time", lot, dest)
    if _has(t, "ice season", "icy", "ice", "snow", "storm", "weather", "roads", "road", "satellite", "slippery"):
        if _has(t, "walkway", "walkways", "path", "paths", "sidewalk", "sidewalks", "ramp", "ramps", "hazard", "hazards"):
            return Intent("hazards", lot, dest)
        return Intent("conditions", lot, dest)
    if _has(t, "hazard", "hazards", "walkway", "walkways", "ramp", "ramps", "sidewalk", "sidewalks"):
        return Intent("hazards", lot, dest)
    if _has(t, "where", "park", "parking", "lot", "best", "recommend", "should i", "spot", "space") or dest:
        return Intent("best", lot, dest)
    if lot:
        return Intent("lot_status", lot, dest)
    return Intent("help", None, dest)


HELP_TEXT = ("You can ask: where should I park, is Hochstetter full, when should I leave, "
             "is it icy, or take me to Stadium Lot.")
