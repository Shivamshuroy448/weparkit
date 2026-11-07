"""Privacy filter: runs BEFORE any image is written to disk.

Layers (each used when available):
  1. People boxes from the detector (YOLO class 'person') -> blurred.
  2. OpenCV Haar face + licence-plate cascades (OpenCV 4.x ships them in cv2.data).
  3. Plate zones: the lower-centre band of every detected vehicle -> blurred.
  4. Skin-tone blobs (YCrCb) as a conservative catch-all for faces the detectors missed.
The raw upload only ever exists in memory.
"""
from __future__ import annotations

import os

import cv2
import numpy as np

from .base import Box

_CASCADES: dict[str, object] | None = None


def _load_cascades() -> dict[str, object]:
    global _CASCADES
    if _CASCADES is not None:
        return _CASCADES
    _CASCADES = {}
    if not hasattr(cv2, "CascadeClassifier"):
        return _CASCADES
    base = getattr(getattr(cv2, "data", None), "haarcascades", "")
    for key, fname in (("face", "haarcascade_frontalface_default.xml"),
                       ("plate", "haarcascade_russian_plate_number.xml")):
        path = os.path.join(base, fname)
        if os.path.exists(path):
            clf = cv2.CascadeClassifier(path)
            if not clf.empty():
                _CASCADES[key] = clf
    return _CASCADES


def _blur_region(img: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> bool:
    h, w = img.shape[:2]
    x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
    if x2 - x1 < 3 or y2 - y1 < 3:
        return False
    roi = img[y1:y2, x1:x2]
    k = max(7, (min(roi.shape[:2]) // 3) | 1)
    img[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (k, k), 0)
    return True


def apply_privacy_blur(img: np.ndarray, vehicles: list[Box], people: list[Box]) -> tuple[np.ndarray, int, list[str]]:
    out = img.copy()
    count, methods = 0, []
    h, w = out.shape[:2]

    for p in people:
        count += _blur_region(out, p.x1, p.y1, p.x2, p.y2)
    if people:
        methods.append("detector_people")

    cascades = _load_cascades()
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    for key in ("face", "plate"):
        clf = cascades.get(key)
        if clf is None:
            continue
        for (x, y, bw, bh) in clf.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(16, 16)):
            count += _blur_region(out, x, y, x + bw, y + bh)
        methods.append(f"haar_{key}")

    # Plate zone on each vehicle: lower-centre band (front/rear plates in oblique shots).
    for v in vehicles:
        bw, bh = v.x2 - v.x1, v.y2 - v.y1
        if bw < 24 or bh < 16:
            continue
        count += _blur_region(out, v.x1 + int(0.3 * bw), v.y1 + int(0.72 * bh), v.x1 + int(0.7 * bw), v.y2)
    if vehicles:
        methods.append("vehicle_plate_zones")

    # Skin-tone blobs: conservative fallback when no face detector is available.
    if "haar_face" not in methods:
        ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
        skin = cv2.inRange(ycrcb, (40, 138, 80), (240, 172, 125))
        skin = cv2.morphologyEx(skin, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        contours, _ = cv2.findContours(skin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        min_a, max_a = 0.0004 * h * w, 0.05 * h * w
        for c in contours:
            a = cv2.contourArea(c)
            if min_a <= a <= max_a:
                x, y, bw, bh = cv2.boundingRect(c)
                if 0.5 <= bw / max(bh, 1) <= 1.6:
                    count += _blur_region(out, x - 4, y - 4, x + bw + 4, y + bh + 4)
        methods.append("skin_tone_fallback")

    return out, count, methods
