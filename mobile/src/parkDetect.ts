// Parked / not-parked auto-detection from foreground GPS fixes. Pure functions, no React.
//
// Arrive: you were driving in the last 10 min, and now you've stayed (nearly) still inside a lot
//         outline for 45 s  ->  check in.
// Leave:  you're checked in and the last two fixes are at driving speed, away from your car
//         ->  check out.
// Needs GPS speed, so it's effectively phone-only (browsers rarely report speed).

export interface Fix { t: number; lat: number; lng: number; speed: number | null; lotId: number | null }
export type Decision = { kind: "checkin"; lotId: number } | { kind: "checkout" } | null;

export const DRIVE_MPS = 6;        // ~13 mph: definitely in a car
export const STILL_MPS = 1.5;      // walking pace or slower
export const DWELL_MS = 45_000;
export const DRIVE_MEMORY_MS = 10 * 60_000;
export const LEAVE_DISTANCE_M = 150;

export function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const k = Math.PI / 180, R = 6_371_000;
  const x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k), y = (b.lat - a.lat) * k;
  return Math.hypot(x, y) * R;
}

/** Ray-casting point-in-polygon on [lat, lng] vertices. */
export function insidePolygon(lat: number, lng: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Lot the point is in, allowing `slackM` of GPS error around each outline's vertices. */
export function lotAt(lat: number, lng: number, lots: { id: number; polygon: [number, number][] }[], slackM = 20) {
  for (const l of lots) if (insidePolygon(lat, lng, l.polygon)) return l.id;
  for (const l of lots) if (l.polygon.some(([a, b]) => metersBetween({ lat, lng }, { lat: a, lng: b }) <= slackM)) return l.id;
  return null;
}

export function decide(fixes: Fix[], parkedLotId: number | null, car: { lat: number; lng: number } | null, now: number): Decision {
  const recent = fixes.filter((f) => now - f.t <= DRIVE_MEMORY_MS);
  const last = recent[recent.length - 1];
  if (!last) return null;
  const fast = (f: Fix) => f.speed != null && f.speed > DRIVE_MPS;

  if (parkedLotId == null) {
    if (last.lotId == null || !recent.some(fast)) return null;
    // walk back while we're still in the same lot and slow
    let i = recent.length - 1;
    while (i > 0 && recent[i - 1].lotId === last.lotId && !fast(recent[i - 1]) && (recent[i - 1].speed ?? 0) <= STILL_MPS) i--;
    const dwell = recent.slice(i);
    const still = dwell.every((f) => (f.speed ?? 0) <= STILL_MPS);
    return still && dwell.length >= 3 && last.t - dwell[0].t >= DWELL_MS ? { kind: "checkin", lotId: last.lotId } : null;
  }

  const [a, b] = recent.slice(-2);
  if (!a || !b || !fast(a) || !fast(b)) return null;
  const away = (f: Fix) => f.lotId !== parkedLotId || (car ? metersBetween(f, car) > LEAVE_DISTANCE_M : false);
  return away(a) && away(b) ? { kind: "checkout" } : null;
}
