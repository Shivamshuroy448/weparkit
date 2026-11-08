"""GOES-19 imagery retrieval and snow-band tracking.

Live path: NOAA STAR CDN publishes GOES-19 ABI sector images every few minutes. We list the
Northeast sector (ne), band 13 (10.3 um 'clean' longwave IR), and pull the two newest frames.
In IR imagery cold cloud tops are bright, so lake-effect snow bands show up as long, bright,
elongated features.

Pipeline (identical for live, archived and simulated frames):
  1. Grayscale + blur, threshold the coldest (brightest) pixels.
  2. Morphology, contours, keep elongated large blobs -> candidate snow bands.
  3. Farneback dense optical flow between consecutive frames, median flow inside the band
     -> pixel motion per frame -> km/h and heading (cross-checked with centroid drift).
  4. Project the band's leading edge onto its motion vector to get distance and ETA to
     Buffalo, and check Buffalo lies within the band's swath.

Simulated frames are generated here and ALWAYS labelled SIMULATED SATELLITE FEED.
"""
from __future__ import annotations

import logging
import math
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import cv2
import httpx
import numpy as np

from ..config import DATA_DIR, get_settings
from .swr import SWRCache
from ..timeutil import utcnow

log = logging.getLogger(__name__)
settings = get_settings()
SAT_DIR = DATA_DIR / "satellite"
ARCHIVE_DIR = DATA_DIR / "storm_frames"

SOURCE_LIVE, SOURCE_SIM, SOURCE_ARCHIVE = "goes19_live", "simulated", "archived_frames"
SOURCE_LABELS = {
    SOURCE_LIVE: "NOAA GOES-19 live imagery (STAR CDN, ABI band 13 IR)",
    SOURCE_SIM: "SIMULATED SATELLITE FEED (generated frames, real processing)",
    SOURCE_ARCHIVE: "Archived satellite frames (replay)",
}


@dataclass
class Geometry:
    buffalo_px: tuple[int, int]
    km_per_px: float
    lake_center: tuple[int, int] | None = None


@dataclass
class Frame:
    image: np.ndarray              # BGR
    acquired_at: datetime
    source: str
    path: str = ""


@dataclass
class Band:
    contour: np.ndarray
    centroid: tuple[float, float]
    area_px: float
    aspect: float
    angle_deg: float


@dataclass
class TrackResult:
    band_detected: bool
    band_count: int
    dx_px: float | None = None
    dy_px: float | None = None
    speed_kph: float | None = None
    heading_deg: float | None = None
    moving_toward: bool = False
    eta_minutes: float | None = None
    distance_km: float | None = None
    method: str = ""
    per_frame: list[dict] = field(default_factory=list)


# ----------------------------------------------------------------------------- detection

def detect_bands(img: np.ndarray, min_area_frac: float = 0.002, min_aspect: float = 2.2) -> tuple[list[Band], np.ndarray]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh_val = max(170, int(np.percentile(gray, 92)))
    _, mask = cv2.threshold(gray, thresh_val, 255, cv2.THRESH_BINARY)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    bands, total = [], gray.shape[0] * gray.shape[1]
    keep = np.zeros_like(mask)
    for c in contours:
        a = cv2.contourArea(c)
        if a < min_area_frac * total:
            continue
        (cx, cy), (w, h), ang = cv2.minAreaRect(c)
        if min(w, h) == 0:
            continue
        aspect = max(w, h) / min(w, h)
        if aspect < min_aspect:
            continue
        bands.append(Band(c, (cx, cy), a, aspect, ang))
        cv2.drawContours(keep, [c], -1, 255, -1)
    bands.sort(key=lambda b: b.area_px, reverse=True)
    return bands, keep


def _flow(prev: np.ndarray, curr: np.ndarray, mask: np.ndarray) -> tuple[float, float] | None:
    g0 = cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY) if prev.ndim == 3 else prev
    g1 = cv2.cvtColor(curr, cv2.COLOR_BGR2GRAY) if curr.ndim == 3 else curr
    flow = cv2.calcOpticalFlowFarneback(g0, g1, None, 0.5, 4, 21, 5, 7, 1.5, 0)
    sel = mask > 0
    if sel.sum() < 30:
        return None
    return float(np.median(flow[..., 0][sel])), float(np.median(flow[..., 1][sel]))


def track(frames: list[Frame], geo: Geometry) -> TrackResult:
    if not frames:
        return TrackResult(False, 0, method="no frames")
    per_frame, band_seq = [], []
    for f in frames:
        bands, mask = detect_bands(f.image)
        band_seq.append((bands, mask))
        per_frame.append({"acquired_at": f.acquired_at.isoformat(timespec="seconds") + "Z",
                          "band_count": len(bands),
                          "centroid": [round(bands[0].centroid[0], 1), round(bands[0].centroid[1], 1)] if bands else None})
    last_bands, _ = band_seq[-1]
    if not last_bands:
        return TrackResult(False, 0, method="no band in latest frame", per_frame=per_frame)

    flows, drifts, minutes = [], [], []
    for i in range(1, len(frames)):
        b0, m0 = band_seq[i - 1]
        b1, _ = band_seq[i]
        if not b0 or not b1:
            continue
        fl = _flow(frames[i - 1].image, frames[i].image, m0)
        dt = (frames[i].acquired_at - frames[i - 1].acquired_at).total_seconds() / 60
        if fl is None or dt <= 0:
            continue
        flows.append(fl)
        drifts.append((b1[0].centroid[0] - b0[0].centroid[0], b1[0].centroid[1] - b0[0].centroid[1]))
        minutes.append(dt)

    result = TrackResult(True, len(last_bands), per_frame=per_frame)
    if not flows:
        result.method = "single frame: band detected, motion unknown"
        return result

    fdx, fdy = float(np.mean([f[0] for f in flows])), float(np.mean([f[1] for f in flows]))
    cdx, cdy = float(np.mean([d[0] for d in drifts])), float(np.mean([d[1] for d in drifts]))
    flow_mag, drift_mag = math.hypot(fdx, fdy), math.hypot(cdx, cdy)
    if drift_mag > 0.5 and flow_mag < 0.4 * drift_mag:
        dx, dy, result.method = cdx, cdy, "centroid drift (optical flow too weak)"
    else:
        dx, dy, result.method = fdx, fdy, "Farneback optical flow"
    dt = float(np.mean(minutes))
    px_per_min = math.hypot(dx, dy) / dt
    result.dx_px, result.dy_px = round(dx, 2), round(dy, 2)
    result.speed_kph = round(px_per_min * geo.km_per_px * 60, 1)
    # heading: 0 = north, 90 = east (image y grows southward)
    result.heading_deg = round((math.degrees(math.atan2(dx, -dy)) + 360) % 360, 0)

    band = last_bands[0]
    bx, by = geo.buffalo_px
    if cv2.pointPolygonTest(band.contour, (float(bx), float(by)), False) >= 0:
        result.moving_toward, result.eta_minutes, result.distance_km = True, 0.0, 0.0
        return result
    if px_per_min < 1e-3:
        return result
    ux, uy = dx / math.hypot(dx, dy), dy / math.hypot(dx, dy)
    pts = band.contour.reshape(-1, 2).astype(float)
    along = pts[:, 0] * ux + pts[:, 1] * uy
    across = pts[:, 0] * -uy + pts[:, 1] * ux
    b_along, b_across = bx * ux + by * uy, bx * -uy + by * ux
    lead = along.max()
    margin = 8
    in_swath = across.min() - margin <= b_across <= across.max() + margin
    dist_px = b_along - lead
    result.distance_km = round(max(0.0, dist_px) * geo.km_per_px, 1)
    if in_swath and dist_px > 0:
        result.moving_toward = True
        result.eta_minutes = round(dist_px / px_per_min, 0)
    return result


def overlay(frame: Frame, tr: TrackResult, geo: Geometry) -> np.ndarray:
    img = frame.image.copy()
    bands, _ = detect_bands(img)
    for b in bands:
        cv2.drawContours(img, [b.contour], -1, (69, 154, 255), 2)
    bx, by = geo.buffalo_px
    cv2.drawMarker(img, (bx, by), (69, 154, 255), cv2.MARKER_DIAMOND, 14, 2)
    cv2.putText(img, "UB", (bx + 9, by + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
    if bands and tr.dx_px is not None:
        cx, cy = bands[0].centroid
        scale = 6
        end = (int(cx + tr.dx_px * scale), int(cy + tr.dy_px * scale))
        cv2.arrowedLine(img, (int(cx), int(cy)), end, (242, 225, 93), 2, tipLength=0.25)
    label = SOURCE_LABELS[frame.source]
    cv2.rectangle(img, (0, 0), (img.shape[1], 22), (24, 11, 8), -1)
    cv2.putText(img, label[:80], (6, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)
    return img


def save_image(img: np.ndarray, tag: str) -> str:
    SAT_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{tag}_{uuid.uuid4().hex[:10]}.jpg"
    cv2.imwrite(str(SAT_DIR / name), img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return f"/media/satellite/{name}"


# ----------------------------------------------------------------------------- live source

_FILE_RE = re.compile(r"(\d{11})_GOES19-ABI-ne-13-(\d+x\d+)\.jpg")


def _parse_stamp(stamp: str) -> datetime:
    year, doy, hh, mm = int(stamp[:4]), int(stamp[4:7]), int(stamp[7:9]), int(stamp[9:11])
    return datetime(year, 1, 1) + timedelta(days=doy - 1, hours=hh, minutes=mm)


def live_listing(force: bool = False) -> tuple[list[tuple[datetime, str]] | None, str | None]:
    """Returns ([(acquired_at, url)...] newest last, error)."""
    if not settings.satellite_live_enabled:
        return None, "Live satellite retrieval disabled (SATELLITE_LIVE_ENABLED=false)"
    # Served from a stale-while-revalidate cache: request handlers never wait on NOAA once warm.
    return listing_cache.get(force=force) or (None, "NOAA listing not loaded yet")


def _fetch_listing() -> tuple[list[tuple[datetime, str]] | None, str | None]:
    try:
        r = httpx.get(settings.goes_sector_url, timeout=settings.external_timeout_s,
                      headers={"User-Agent": settings.nws_user_agent})
        r.raise_for_status()
        found = {(m.group(1)) for m in _FILE_RE.finditer(r.text) if m.group(2) == settings.goes_image_size}
        listing = sorted((_parse_stamp(s), f"{settings.goes_sector_url}{s}_GOES19-ABI-ne-13-{settings.goes_image_size}.jpg") for s in found)
        return (listing or None), (None if listing else "No frames listed")
    except Exception as exc:
        return None, f"NOAA STAR CDN unreachable: {type(exc).__name__}"


listing_cache = SWRCache("goes-listing", _fetch_listing, ttl_s=300)


def fetch_live_frames(n: int = 2) -> tuple[list[Frame], str | None]:
    listing, err = live_listing()
    if not listing:
        return [], err
    frames = []
    for acquired, url in listing[-n:]:
        try:
            r = httpx.get(url, timeout=settings.external_timeout_s, headers={"User-Agent": settings.nws_user_agent})
            r.raise_for_status()
            img = cv2.imdecode(np.frombuffer(r.content, np.uint8), cv2.IMREAD_COLOR)
            if img is not None:
                frames.append(Frame(img, acquired, SOURCE_LIVE, save_image(img, "goes19")))
        except Exception as exc:
            return [], f"Frame download failed: {type(exc).__name__}"
    return frames, None


def live_geometry() -> Geometry:
    return Geometry((settings.buffalo_px_x, settings.buffalo_px_y), settings.km_per_px)


# ----------------------------------------------------------------------------- simulated / archive

SIM_GEO = Geometry(buffalo_px=(426, 300), km_per_px=2.0, lake_center=(290, 362))


def _sim_base(rng: np.random.Generator, size: int = 600) -> np.ndarray:
    base = rng.normal(70, 8, (size, size)).astype(np.float32)
    yy, xx = np.mgrid[0:size, 0:size]
    base += (yy / size) * 25  # warmer (darker) to the south... subtle gradient
    img = np.clip(base, 0, 255).astype(np.uint8)
    img = cv2.GaussianBlur(img, (7, 7), 0)
    # Lake Erie: slightly warmer/darker water body aligned SW-NE
    cv2.ellipse(img, SIM_GEO.lake_center, (150, 38), -28, 0, 360, 52, -1)
    # Lake Ontario to the NE
    cv2.ellipse(img, (500, 232), (105, 26), -12, 0, 360, 52, -1)
    # scattered warm low clouds (not bands)
    for _ in range(14):
        c = (int(rng.uniform(0, size)), int(rng.uniform(0, size)))
        cv2.circle(img, c, int(rng.uniform(6, 16)), int(rng.uniform(110, 150)), -1)
    return cv2.GaussianBlur(img, (5, 5), 0)


def simulate_frames(storm: bool, n: int = 6, step_min: int = 10, seed: int = 42) -> list[Frame]:
    """Generates n IR-like frames ending now. In storm mode a lake-effect band drifts SE toward UB."""
    rng = np.random.default_rng(seed)
    base = _sim_base(rng)
    tex = cv2.GaussianBlur(rng.normal(0, 20, base.shape).astype(np.float32), (0, 0), 3)
    now = utcnow().replace(second=0, microsecond=0)
    frames = []
    # Band lies along the lake axis (SW-NE) and drifts SE onto Buffalo at ~4.5 px / 10 min
    # (~54 km/h), its leading edge ending ~18 px (~36 km) short of UB.
    u = np.array([math.sin(math.radians(28)), math.cos(math.radians(28))])
    vel = u * 4.5
    final = np.array(SIM_GEO.buffalo_px, float) - u * (15 + 18)
    start = final - vel * (n - 1)
    for i in range(n):
        img = base.astype(np.float32).copy()
        if storm:
            c = start + vel * i
            band = np.zeros_like(img)
            cv2.ellipse(band, (int(c[0]), int(c[1])), (95, 15), -28, 0, 360, 1.0, -1)
            band = cv2.GaussianBlur(band, (0, 0), 3)
            shifted_tex = np.roll(np.roll(tex, int(round(vel[0] * i)), axis=1), int(round(vel[1] * i)), axis=0)
            img = img * (1 - band) + (215 + shifted_tex) * band
        img += rng.normal(0, 2, img.shape)
        g = np.clip(img, 0, 255).astype(np.uint8)
        bgr = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)
        t = now - timedelta(minutes=step_min * (n - 1 - i))
        frames.append(Frame(bgr, t, SOURCE_SIM, save_image(_label_sim(bgr), "sim")))
    return frames


def _label_sim(img: np.ndarray) -> np.ndarray:
    out = img.copy()
    cv2.rectangle(out, (0, out.shape[0] - 22), (out.shape[1], out.shape[0]), (24, 11, 8), -1)
    cv2.putText(out, "SIMULATED SATELLITE FEED - not live GOES-19 data", (6, out.shape[0] - 7),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)
    return out


def archived_frames() -> list[Frame]:
    """Real GOES frames dropped into data/storm_frames/ (named YYYYDDDHHMM_*.jpg) replay in order."""
    files = sorted(p for p in ARCHIVE_DIR.glob("*.jpg") if _FILE_RE.match(p.name) or p.name[:11].isdigit())
    frames = []
    for p in files:
        img = cv2.imread(str(p))
        if img is not None:
            frames.append(Frame(img, _parse_stamp(p.name[:11]), SOURCE_ARCHIVE, save_image(img, "archive")))
    return frames
