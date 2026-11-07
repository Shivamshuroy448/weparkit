"""Generates the bundled SYNTHETIC sample photos used by the demo.

These are computer-drawn overhead lot views (not real UB photos) plus a stall map for each,
so the calibrated-region analysis has a camera view to work with. Every image carries a
'SYNTHETIC SAMPLE' watermark. Run:  python -m scripts.generate_samples
"""
from __future__ import annotations

import json
import random
from pathlib import Path

import cv2
import numpy as np

OUT = Path(__file__).resolve().parent.parent / "data" / "samples"
W, H = 960, 640
SLOT_W, SLOT_H = 64, 104
COLS = 12
ROW_Y = [40, 144, 340, 444]  # two double rows with an aisle between
X0 = 96

CAR_COLORS = [(40, 40, 40), (30, 30, 150), (150, 60, 30), (60, 50, 120), (20, 90, 30), (25, 25, 25),
              (180, 170, 165), (120, 40, 40), (40, 120, 200), (200, 100, 40), (35, 35, 90)]


def _asphalt(rng: np.random.Generator) -> np.ndarray:
    img = np.full((H, W, 3), 88, np.uint8)
    noise = rng.normal(0, 6, (H, W, 1)).astype(np.int16)
    return np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)


def _slots() -> list[dict]:
    slots = []
    for r, y in enumerate(ROW_Y):
        for c in range(COLS):
            x = X0 + c * SLOT_W
            slots.append({"id": f"r{r}c{c}", "row": r, "box": [x + 3, y + 3, x + SLOT_W - 3, y + SLOT_H - 3]})
    return slots


def _lines(img: np.ndarray) -> None:
    for y in ROW_Y:
        for c in range(COLS + 1):
            x = X0 + c * SLOT_W
            cv2.line(img, (x, y), (x, y + SLOT_H), (225, 225, 220), 2)


def _car(img: np.ndarray, box: list[int], color: tuple[int, int, int], rng: random.Random) -> None:
    x1, y1, x2, y2 = box
    cx = (x1 + x2) // 2 + rng.randint(-3, 3)
    w, h = 44, 84
    a, b = cx - w // 2, (y1 + y2) // 2 - h // 2 + rng.randint(-4, 4)
    cv2.rectangle(img, (a, b), (a + w, b + h), color, -1)
    cv2.rectangle(img, (a, b), (a + w, b + h), (15, 15, 15), 1)
    cv2.rectangle(img, (a + 5, b + 14), (a + w - 5, b + 30), (30, 25, 20), -1)  # windscreen
    cv2.rectangle(img, (a + 6, b + h - 22), (a + w - 6, b + h - 10), (35, 30, 25), -1)  # rear glass


def _snow(img: np.ndarray, box: list[int], rng: np.random.Generator) -> None:
    x1, y1, x2, y2 = box
    patch = np.clip(rng.normal(238, 6, (y2 - y1 + 8, x2 - x1 + 8, 3)), 200, 255).astype(np.uint8)
    img[y1 - 4:y2 + 4, x1 - 4:x2 + 4] = patch


def _pile(img: np.ndarray, center: tuple[int, int], axes: tuple[int, int]) -> None:
    cv2.ellipse(img, center, axes, 0, 0, 360, (240, 242, 245), -1)
    cv2.ellipse(img, center, (axes[0] - 10, axes[1] - 8), 0, 0, 360, (250, 250, 252), -1)


def _watermark(img: np.ndarray, title: str) -> None:
    cv2.rectangle(img, (0, H - 30), (W, H), (20, 14, 10), -1)
    cv2.putText(img, f"SYNTHETIC SAMPLE - {title} - not a real UB photo", (12, H - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1, cv2.LINE_AA)


def make_lot(name: str, title: str, occupied: int, snow_row: int | None, snow_extra: int, pile: bool, seed: int) -> None:
    rng_np, rng = np.random.default_rng(seed), random.Random(seed)
    img = _asphalt(rng_np)
    slots = _slots()
    # snow dusting on verges
    img[:28] = np.clip(rng_np.normal(236, 5, (28, W, 3)), 200, 255).astype(np.uint8)
    _lines(img)

    ids = list(range(len(slots)))
    blocked: set[int] = set()
    if snow_row is not None:
        row_ids = [i for i in ids if slots[i]["row"] == snow_row]
        blocked |= set(row_ids[: max(0, int(len(row_ids) * 0.75))])
    others = [i for i in ids if i not in blocked]
    rng.shuffle(others)
    blocked |= set(others[:snow_extra])
    remaining = [i for i in ids if i not in blocked]
    rng.shuffle(remaining)
    occ = set(remaining[:occupied])

    for i in blocked:
        _snow(img, slots[i]["box"], rng_np)
    for i in occ:
        _car(img, slots[i]["box"], rng.choice(CAR_COLORS), rng)
    if pile:
        _pile(img, (X0 + COLS * SLOT_W + 50, 300), (40, 70))
    img = cv2.GaussianBlur(img, (3, 3), 0)
    _watermark(img, title)

    OUT.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(OUT / f"{name}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    meta = {"title": title, "synthetic": True, "image_width": W, "image_height": H, "slots": slots,
            "ground_truth": {"occupied": len(occ), "snow_blocked": len(blocked),
                             "open": len(slots) - len(occ) - len(blocked)}}
    (OUT / f"{name}.json").write_text(json.dumps(meta, indent=1))


def make_walkway(seed: int = 7) -> None:
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 3), np.uint8)
    img[:] = (70, 60, 55)
    # sky/buildings band
    img[: int(H * 0.35)] = (120, 105, 95)
    # snow banks
    bank = np.array([[0, H], [0, int(H * 0.38)], [W * 0.38, int(H * 0.38)], [W * 0.18, H]], np.int32)
    cv2.fillPoly(img, [bank], (238, 240, 242))
    bank2 = np.array([[W, H], [W, int(H * 0.38)], [W * 0.62, int(H * 0.38)], [W * 0.82, H]], np.int32)
    cv2.fillPoly(img, [bank2], (236, 238, 241))
    # glazed path (bluish, smooth)
    path = np.array([[W * 0.18, H], [W * 0.38, int(H * 0.38)], [W * 0.62, int(H * 0.38)], [W * 0.82, H]], np.int32)
    cv2.fillPoly(img, [path], (150, 128, 112))
    # specular streaks
    for _ in range(40):
        x = int(rng.uniform(W * 0.35, W * 0.65))
        y = int(rng.uniform(H * 0.5, H * 0.95))
        cv2.ellipse(img, (x, y), (int(rng.uniform(10, 40)), 3), 0, 0, 360, (252, 252, 250), -1)
    img = cv2.GaussianBlur(img, (5, 5), 0)
    _watermark(img, "Icy walkway")
    cv2.imwrite(str(OUT / "icy_walkway.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 92])


SAMPLES = [
    ("jarvis_a_winter", "Jarvis A after a storm", 30, 3, 2, True, 11),
    ("hochstetter_b_busy", "Hochstetter B, busy morning", 44, None, 2, True, 23),
    ("center_for_tomorrow_open", "Center for Tomorrow, plowed", 18, None, 0, False, 5),
]

if __name__ == "__main__":
    for args in SAMPLES:
        make_lot(*args)
    make_walkway()
    print(f"Wrote samples to {OUT}")
