"""Shared types for the replaceable vision layer.

A *detector* finds vehicles (and people, for privacy). A *space analyzer* turns the image +
detections into an explicitly-labelled open-space estimate. An optional *assessor* (Gemini)
judges snow, plowing and spaces. The pipeline combines them. Swap any piece without touching
the API layer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

import numpy as np


@dataclass
class Box:
    x1: int
    y1: int
    x2: int
    y2: int
    label: str = "car"
    score: float = 0.5

    @property
    def area(self) -> int:
        return max(0, self.x2 - self.x1) * max(0, self.y2 - self.y1)

    def as_dict(self) -> dict:
        return {"x1": self.x1, "y1": self.y1, "x2": self.x2, "y2": self.y2, "label": self.label, "score": round(self.score, 3)}


@dataclass
class Detections:
    vehicles: list[Box]
    people: list[Box] = field(default_factory=list)
    provider: str = "unknown"
    base_confidence: float = 0.5
    note: str = ""


class VehicleDetector(Protocol):
    name: str

    def available(self) -> bool: ...

    def detect(self, image: np.ndarray) -> Detections: ...


@dataclass
class SpaceEstimate:
    method: str                 # calibrated_regions | gemini_vision | area_heuristic
    method_label: str
    visible_spaces: int
    occupied_spaces: int
    open_spaces: int
    snow_blocked_spaces: int
    plowed_rows: int | None
    unplowed_rows: int | None
    confidence: float
    regions: list[dict] = field(default_factory=list)  # per-slot classification for overlays


def iou_fraction(inner: Box, outer: Box) -> float:
    """Fraction of `inner` covered by `outer`."""
    x1, y1 = max(inner.x1, outer.x1), max(inner.y1, outer.y1)
    x2, y2 = min(inner.x2, outer.x2), min(inner.y2, outer.y2)
    if x2 <= x1 or y2 <= y1 or inner.area == 0:
        return 0.0
    return (x2 - x1) * (y2 - y1) / inner.area
