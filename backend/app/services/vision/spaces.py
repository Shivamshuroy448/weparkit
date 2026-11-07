"""Open-space estimation. Vehicle count is NOT treated as an open-space count.

calibrated_regions  Each parking stall is a configured rectangle (per camera / sample photo).
                    A stall is OCCUPIED if a detected vehicle covers it or its texture says so,
                    SNOW-BLOCKED if it is mostly bright low-saturation snow, else OPEN.
area_heuristic      No stall map: open asphalt area / median vehicle footprint x packing factor.
                    Rough, low confidence, labelled as such. Gemini replaces it when configured.
"""
from __future__ import annotations

import cv2
import numpy as np

from .base import Box, SpaceEstimate, iou_fraction
from .detectors import surface_masks


def estimate_with_regions(image: np.ndarray, vehicles: list[Box], regions: dict, scale: float = 1.0) -> SpaceEstimate:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    slots_out = []
    rows: dict[int, dict[str, int]] = {}
    occupied = open_ = blocked = 0

    for slot in regions["slots"]:
        x1, y1, x2, y2 = (int(round(v * scale)) for v in slot["box"])
        sb = Box(x1, y1, x2, y2)
        cover = max((iou_fraction(sb, v) for v in vehicles), default=0.0)
        patch_v = hsv[y1:y2, x1:x2, 2]
        patch_s = hsv[y1:y2, x1:x2, 1]
        snow_frac = float(np.mean((patch_v > 180) & (patch_s < 40))) if patch_v.size else 0.0
        texture = float(np.std(gray[y1:y2, x1:x2])) if patch_v.size else 0.0

        if cover >= 0.3:
            state = "occupied"
        elif snow_frac >= 0.55:
            state = "snow_blocked"
        elif texture > 38 and snow_frac < 0.3:
            state = "occupied"  # something stall-sized that the detector missed
        else:
            state = "open"
        occupied += state == "occupied"
        open_ += state == "open"
        blocked += state == "snow_blocked"
        r = rows.setdefault(int(slot.get("row", 0)), {"total": 0, "blocked": 0})
        r["total"] += 1
        r["blocked"] += state == "snow_blocked"
        slots_out.append({"box": [x1, y1, x2, y2], "row": slot.get("row", 0), "state": state})

    unplowed = sum(1 for r in rows.values() if r["blocked"] / r["total"] >= 0.6)
    return SpaceEstimate(
        method="calibrated_regions",
        method_label="Estimated from calibrated stall regions for this camera view",
        visible_spaces=len(regions["slots"]), occupied_spaces=occupied, open_spaces=open_,
        snow_blocked_spaces=blocked, plowed_rows=len(rows) - unplowed, unplowed_rows=unplowed,
        confidence=0.8, regions=slots_out,
    )


def estimate_by_area(image: np.ndarray, vehicles: list[Box]) -> SpaceEstimate:
    asphalt, snow = surface_masks(image)
    veh_mask = np.zeros(asphalt.shape, np.uint8)
    for v in vehicles:
        cv2.rectangle(veh_mask, (v.x1, v.y1), (v.x2, v.y2), 255, -1)
    free_asphalt = cv2.countNonZero(cv2.bitwise_and(asphalt, cv2.bitwise_not(veh_mask)))
    snow_px = cv2.countNonZero(cv2.bitwise_and(snow, cv2.bitwise_not(veh_mask)))
    if vehicles:
        footprint = float(np.median([v.area for v in vehicles]))
    else:
        footprint = 0.012 * image.shape[0] * image.shape[1]
    packing = 0.22  # driving aisles, kerbs and verges are not stalls
    open_est = int(free_asphalt / footprint * packing)
    snow_est = int(snow_px / footprint * packing * 0.5)  # some snow is verges, not stalls
    occ = len(vehicles)
    return SpaceEstimate(
        method="area_heuristic",
        method_label="Rough area-based estimate (no stall map for this view)",
        visible_spaces=occ + open_est + snow_est, occupied_spaces=occ, open_spaces=open_est,
        snow_blocked_spaces=snow_est, plowed_rows=None, unplowed_rows=None, confidence=0.35,
    )


def snow_cover_fraction(image: np.ndarray) -> float:
    _, snow = surface_masks(image)
    return cv2.countNonZero(snow) / snow.size
