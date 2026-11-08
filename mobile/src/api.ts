// Typed API client for the IceStation FastAPI backend.
import { API_BASE as BASE } from "./config";

/** A photo picked with expo-image-picker. React Native FormData accepts {uri,name,type}. */
export interface PickedImage { uri: string; name?: string; mimeType?: string }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Phones on a firewalled network don't get "connection refused"; the request just hangs. Fail fast instead.
const TIMEOUT_MS = 12000;
const UPLOAD_TIMEOUT_MS = 60000;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.body instanceof FormData ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS);
  try {
    res = await fetch(BASE + path, { ...init, signal: ctrl.signal });
  } catch {
    throw new ApiError(0, `Can't reach the backend at ${BASE}. Check it's running with --host 0.0.0.0 and the phone is online. If it never connects, the network may block phone-to-laptop traffic: use a hotspot or scripts/dev-tunnel.ps1.`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { data = text ? JSON.parse(text) : {}; }
  catch { if (res.ok) throw new ApiError(res.status, `Backend returned non-JSON from ${path}`); data = { detail: text.slice(0, 200) }; }
  if (!res.ok) {
    const d = data?.detail;
    const msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((e: { msg: string }) => e.msg).join("; ") : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const form = (fields: Record<string, string | number | boolean | PickedImage | null | undefined>): RequestInit => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "object") {
      // React Native's FormData file shape
      fd.append(k, { uri: v.uri, name: v.name ?? "photo.jpg", type: v.mimeType ?? "image/jpeg" } as unknown as Blob);
    } else fd.append(k, String(v));
  }
  return { method: "POST", body: fd };
};

export const media = (url?: string | null) => (url && url.startsWith("/") ? BASE + url : url ?? "");

export type Mode = "standard" | "watch" | "ice";

export interface Lot {
  id: number; slug: string; name: string; kind: string; description: string;
  lat: number; lng: number; polygon: [number, number][];
  total_capacity: number; capacity_is_seed_estimate: boolean;
  snow_adjusted_capacity: number; snow_blocked_spaces: number; snow_blocked_fraction: number; snow_source: string;
  occupied: number; available: number; occupancy_pct: number; confidence: number;
  data_source: string; last_update: string | null; report_expires_at: string | null; note: string;
  plowed_rows: number | null; unplowed_rows: number | null; total_rows: number;
  pending_departures: number; search_minutes: number; hourly_profile: number[]; simulated_clock: boolean;
}
export interface LotsResponse { lots: Lot[]; totals: Record<string, number>; mode: Mode; disclaimer: string }

export interface SystemState {
  mode: Mode; auto_mode: Mode; decision_source: string; manual_override: Mode | null; reason: string;
  demo_active: boolean; eta_minutes: number | null; updated_at: string; threshold_minutes: number; source_label: string;
}

export interface ScanResult {
  scan_id: number; lot_id: number; lot_name: string; vehicles_detected: number; estimated_open_spaces: number;
  snow_blocked_spaces: number; occupied_spaces: number; visible_spaces: number; plowed_rows: number | null;
  unplowed_rows: number | null; confidence: number; weather_condition: string; recommendation: string;
  explanation: string; explanation_source: string; space_method: string; space_method_label: string;
  detector: string; detector_note: string; gemini_used: boolean; annotated_image_url: string; blurred_image_url: string;
  privacy: { regions_blurred: number; methods: string[] }; sample_is_synthetic: boolean;
  frame_occupancy_fraction: number; frame_snow_blocked_fraction: number; snow_cover_fraction: number;
}

export interface Hazard {
  id: number; location_name: string; lat: number; lng: number; category: string; category_label: string;
  confidence: number; classified_by: string; explanation: string; image_url: string | null;
  confirmations: number; clear_votes: number; status: string; created_at: string; expires_at: string;
  minutes_left: number; is_demo: boolean; hard_stop_for_wheelchairs: boolean;
}

export interface Route { status: "blocked" | "hazard" | "unverified"; label: string; hazard_ids: number[]; wheelchair_hard_stop: boolean }

export interface LotEval {
  slug: string; name: string; kind: string; snow_adjusted_capacity: number; predicted_occupancy: number;
  expected_open_spaces: number; availability_probability: number; walk_minutes: number; walk_distance_m: number;
  via_shuttle: boolean; search_minutes: number; ice_buffer_minutes: number; recommended_departure: string;
  score: number; label: string; accessible_blocked: boolean; data_source: string; confidence: number; route?: Route;
}
export interface Recommendation {
  destination: string; arrival_time: string; mode: string; best: LotEval | null; backup: LotEval | null; all: LotEval[];
  explanation: string; disclaimer: string; forecast?: { lot: string; series: { time: string; occupancy: number; is_arrival: boolean }[] };
  simulated_clock: boolean; now: string;
}

export interface Notification { id: number; kind: string; title: string; body: string; lot_id: number | null; user_id: number | null; created_at: string; is_demo: boolean; meta: Record<string, unknown> }
export interface CrewUser {
  id: number; handle: string; points: number; reports_submitted: number; hazards_verified: number; assists_given: number;
  needs_accessible_routes: boolean; accepts_assist_requests: boolean; is_seed: boolean; rank: number | null;
  history?: { action: string; points: number; at: string }[];
}
export interface Weather {
  source: string; source_label: string; errors: string[];
  observation: { temperature_c: number | null; wind_kph: number | null; condition: string; observed_at: string; station: string } | null;
  observation_is_demo: boolean;
  alerts: { id: string; event: string; headline: string; severity: string; onset: string; ends: string; winter: boolean; demo: boolean; source: string }[];
  winter_alert_active: boolean; demo_active: boolean;
}
export interface SatObs {
  id: number; source: string; source_label: string; acquired_at: string; image_url: string; overlay_url: string | null;
  band_detected: boolean; band_count: number; speed_kph: number | null; heading_deg: number | null;
  moving_toward_buffalo: boolean; eta_minutes: number | null; is_demo: boolean; analysis: Record<string, unknown>;
}
export interface SatStatus {
  satellite: Record<string, string | number>;
  live_feed: { online: boolean; error: string | null; latest_acquired_at: string | null; latest_image_url: string | null; label: string };
  latest_observation: SatObs | null; latest_analysis: SatObs | null; timeline: SatObs[]; state: SystemState; threshold_minutes: number;
}
export interface Analysis {
  scenario: string; source: string; source_label: string; is_simulated: boolean; live_source_status: string | null;
  frames: { acquired_at: string; image_url: string; band_count: number; centroid: number[] | null }[];
  overlay_url: string;
  track: { band_detected: boolean; band_count: number; speed_kph: number | null; heading_deg: number | null; moving_toward_buffalo: boolean; eta_minutes: number | null; distance_km: number | null; method: string };
  decision: { mode: Mode; reason: string; corroborated: boolean }; weather: Weather; state: SystemState;
}
export interface Meta {
  buildings: { name: string; lat: number; lng: number }[]; hazard_locations: { name: string; lat: number; lng: number }[];
  campus_center: [number, number]; campus_time: string; simulated_clock: boolean; config: Record<string, number>;
}
export interface LocateResult {
  lot: { id: number; slug: string; name: string } | null;
  method: "inside_outline" | "nearest_outline" | "none"; distance_m: number | null; confidence: number;
  search_radius_m: number; accuracy_m: number | null; outline_source: string | null;
  candidates: { id: number; key: string; name: string; distance_m: number }[];
  hazard_location: { name: string; distance_m: number } | null; on_campus: boolean;
}
export interface Sample { id: string; title: string; synthetic: boolean; image_url: string; has_stall_map: boolean; kind?: string }
export interface Health { status: string; mode: Mode; vision_detector: string; gemini_configured: boolean; satellite_source: string; weather_source: string; simulated_clock: boolean; time_campus: string; voice_enabled?: boolean }

export const api = {
  health: () => req<Health>("/api/health"),
  meta: () => req<Meta>("/api/meta"),
  lots: () => req<LotsResponse>("/api/parking/lots"),
  samples: () => req<{ samples: Sample[] }>("/api/parking/samples"),
  locate: (lat: number, lng: number, accuracy_m?: number | null) =>
    req<LocateResult>(`/api/parking/locate?lat=${lat}&lng=${lng}${accuracy_m ? `&accuracy_m=${Math.round(accuracy_m)}` : ""}`),
  scan: (lot_id: number, opts: { file?: PickedImage | null; sample_id?: string | null }) =>
    req<ScanResult>("/api/parking/scan", form({ lot_id, file: opts.file, sample_id: opts.sample_id })),
  report: (body: Record<string, unknown>) => req<{ report_id: number; lot: Lot; points_awarded: number; corrected: boolean; expires_in_minutes: number }>("/api/parking/report", json(body)),
  recommend: (p: { destination: string; arrival: string; accessible: boolean; drive_minutes?: number; user_id?: number }) =>
    req<Recommendation>(`/api/parking/recommendations?${new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))}`),
  leave: (lot_id: number, user_id?: number) => req<{ lot: Lot; points_awarded: number }>("/api/parking/leave", json({ lot_id, user_id })),
  weather: (refresh = false) => req<Weather>(`/api/weather/current${refresh ? "?refresh=true" : ""}`),
  satStatus: () => req<SatStatus>("/api/satellite/status"),
  analyze: () => req<Analysis>("/api/satellite/analyze", { method: "POST" }),
  demoStorm: () => req<Analysis>("/api/satellite/demo-storm", { method: "POST" }),
  state: () => req<SystemState>("/api/state"),
  setMode: (mode: Mode | null) => req<SystemState>("/api/state/mode", json({ mode })),
  reset: () => req<{ ok: boolean }>("/api/demo/reset", { method: "POST" }),
  hazards: () => req<{ hazards: Hazard[] }>("/api/hazards"),
  routes: (destination: string) => req<{ destination: string; routes: (Route & { lot: string; slug: string })[] }>(`/api/hazards/routes?destination=${encodeURIComponent(destination)}`),
  reportHazard: (f: { location_name: string; category: string; user_id?: number; file?: PickedImage | null; sample_id?: string; is_demo?: boolean }) =>
    req<{ created: boolean; hazard?: Hazard; ai: Record<string, unknown> | null; points_awarded?: number; message?: string }>("/api/hazards/report", form(f)),
  vote: (id: number, user_id: number, vote: "confirm" | "clear") => req<{ hazard: Hazard; cleared: boolean; points_awarded: number }>(`/api/hazards/${id}/vote`, json({ user_id, vote })),
  clearHazard: (id: number, user_id: number) => req<{ hazard: Hazard; cleared: boolean; points_awarded: number }>(`/api/hazards/${id}/clear`, json({ user_id })),
  me: (user_id?: number | null, body?: Partial<Pick<CrewUser, "needs_accessible_routes" | "accepts_assist_requests">>) =>
    req<CrewUser>(`/api/crew/me${user_id ? `?user_id=${user_id}` : ""}`, body ? json(body) : { method: "POST" }),
  leaderboard: () => req<{ leaderboard: CrewUser[] }>("/api/crew/leaderboard"),
  assist: (body: { user_id: number; lot_id?: number; location_note?: string; action?: "request" | "respond"; request_id?: number }) =>
    req<{ ok: boolean; request_id?: number; crew_alerted?: number; message?: string; points_awarded?: number }>("/api/crew/assist", json(body)),
  notifications: () => req<{ notifications: Notification[] }>("/api/notifications"),
};

export const fmtTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export const hhmm12 = (t?: string | null) => {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export const ago = (iso?: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};
export const sourceLabel = (s: string) =>
  ({ seed_model: "Model estimate", crew_scan: "Student scan", crew_manual: "Student report", demo: "Demo scan" } as Record<string, string>)[s] ?? s;

/** Shared "full" rule so lists, maps and sheets never disagree. */
export const lotFull = (l: Pick<Lot, "available" | "snow_adjusted_capacity">) => l.available <= Math.max(2, l.snow_adjusted_capacity * 0.02);

/** "LIKELY OPEN" -> "Likely open" */
export const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

/** Availability label -> badge tone. */
export const availabilityTone = (label: string) =>
  (label === "LIKELY OPEN" ? "success" : label === "TIGHT" ? "warn" : "danger") as "success" | "warn" | "danger";

export const minutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m` : `${Math.round(m)} min`);

/** Backend paths that stream ElevenLabs MP3 audio (see backend/app/routers/voice.py). */
export const voicePaths = {
  briefing: (destination: string, arrival?: string, accessible = false) =>
    `/api/voice/briefing?${new URLSearchParams({ destination, accessible: String(accessible), ...(arrival ? { arrival } : {}) })}`,
  lot: (id: number) => `/api/voice/lot/${id}`,
  alert: (kind: "ice_on" | "ice_off" | "lot_full", destination: string, lotId?: number) =>
    `/api/voice/alert?${new URLSearchParams({ kind, destination, ...(lotId ? { lot_id: String(lotId) } : {}) })}`,
};

export interface CopilotAnswer {
  transcript: string; intent: string; answer: string; destination: string; speech_path: string;
  action: "directions" | null; lot: { id: number; slug: string; name: string; lat: number; lng: number } | null;
}

/** Voice co-pilot: a recorded question (ElevenLabs speech-to-text on the server) or typed text. */
export async function askCopilot(q: { audioUri?: string; text?: string; destination: string; arrival?: string; accessible?: boolean }) {
  const fd = new FormData();
  if (q.text) fd.append("text", q.text);
  if (q.audioUri) {
    if (q.audioUri.startsWith("blob:") || q.audioUri.startsWith("data:")) {
      // Web recorder hands back a blob URL; native FormData takes {uri,name,type}.
      const blob = await (await fetch(q.audioUri)).blob();
      fd.append("file", blob, "question.webm");
    } else {
      fd.append("file", { uri: q.audioUri, name: "question.m4a", type: "audio/mp4" } as unknown as Blob);
    }
  }
  fd.append("destination", q.destination);
  if (q.arrival) fd.append("arrival", q.arrival);
  fd.append("accessible", String(!!q.accessible));
  return req<CopilotAnswer>("/api/voice/ask", { method: "POST", body: fd });
}

/** Google Maps driving directions to a point. Opens the Maps app when installed, the web otherwise. */
export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
