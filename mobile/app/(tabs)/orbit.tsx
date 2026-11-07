import { useFocusEffect } from "expo-router";
import { CloudSnow, Play, RefreshCw, TriangleAlert } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, View } from "react-native";
import { api, fmtTime, media, type Analysis, type SatStatus } from "../../src/api";
import Header from "../../src/components/Header";
import { Button, Card, DemoTag, ErrorNote, Inset, Loading, Pill, Screen, T, row } from "../../src/components/ui";
import { useStore } from "../../src/store";

const compass = (deg?: number | null) =>
  deg == null ? "—" : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];

export default function OrbitalIntelligence() {
  const { c, weather, state, refresh, toast } = useStore();
  const [status, setStatus] = useState<SatStatus | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState<"analyze" | "storm" | null>(null);
  const [frameIdx, setFrameIdx] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try { setStatus(await api.satStatus()); } catch (e) { toast((e as Error).message, "error"); }
  }, [toast]);
  useFocusEffect(useCallback(() => { load(); }, [load, state?.mode]));
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  // step through the replay frames, then land on the overlay
  const play = (a: Analysis) => {
    if (timer.current) clearInterval(timer.current);
    let i = 0;
    setFrameIdx(0);
    timer.current = setInterval(() => {
      i += 1;
      if (i >= a.frames.length) { clearInterval(timer.current!); setFrameIdx(null); return; }
      setFrameIdx(i);
    }, 650);
  };

  const run = async (kind: "analyze" | "storm") => {
    setBusy(kind);
    try {
      const a = kind === "storm" ? await api.demoStorm() : await api.analyze();
      setAnalysis(a);
      if (a.frames.length > 1) play(a);
      await Promise.all([load(), refresh("state", "lots", "weather", "notifications")]);
      toast(a.state.mode === "ice" ? "Snow band inbound. Ice season engaged." : `Analysis complete: ${a.decision.mode}`, a.state.mode === "ice" ? "ok" : "info");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(null); }
  };

  const tr = analysis?.track ?? (status?.latest_analysis ? {
    band_detected: status.latest_analysis.band_detected, speed_kph: status.latest_analysis.speed_kph,
    heading_deg: status.latest_analysis.heading_deg, moving_toward_buffalo: status.latest_analysis.moving_toward_buffalo,
    eta_minutes: status.latest_analysis.eta_minutes, distance_km: (status.latest_analysis.analysis?.distance_km as number) ?? null,
    method: (status.latest_analysis.analysis?.method as string) ?? "", band_count: status.latest_analysis.band_count,
  } : null);
  const viewerUrl = frameIdx != null && analysis ? analysis.frames[frameIdx].image_url
    : analysis?.overlay_url ?? status?.latest_analysis?.overlay_url ?? status?.live_feed.latest_image_url ?? null;
  const sourceLabel = analysis?.source_label ?? status?.latest_analysis?.source_label ?? status?.live_feed.label;
  const simulated = (analysis?.source ?? status?.latest_analysis?.source) !== "goes19_live";
  const threshold = status?.threshold_minutes ?? 60;
  const eta = tr?.eta_minutes;

  return (
    <Screen header={<Header kicker="ORBITAL FEED · GOES-19" title="Eye in the sky" />} onRefresh={load}>
      <View style={row.wrap}>
        <Inset style={{ flex: 1 }}><T v="h3">35,786 km</T><T v="small">Above equator</T></Inset>
        <Inset style={{ flex: 1 }}><T v="h3">75.2° W</T><T v="small">Parked over</T></Inset>
        <Inset style={{ flex: 1 }}><T v="h3">~5 min</T><T v="small">New image</T></Inset>
      </View>

      <Card kicker={`NOAA GOES-19 (GOES-EAST) · ${status?.live_feed.online ? "LIVE FEED ONLINE" : "LIVE FEED OFFLINE"}`}>
        {status?.live_feed.error && <T v="small" color={c.orange}>{status.live_feed.error}. Using a labelled simulated feed.</T>}
        {status?.live_feed.latest_acquired_at && <T v="small">Latest GOES-19 frame: {fmtTime(status.live_feed.latest_acquired_at)}</T>}
        <View style={{ marginTop: 10 }}>
          {viewerUrl ? (
            <Image source={{ uri: media(viewerUrl) }} style={{ width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: "#000" }} />
          ) : (
            <View style={{ aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: c.line, alignItems: "center", justifyContent: "center" }}>
              <T v="mono">[ NO ANALYSIS YET · RUN ONE BELOW ]</T>
            </View>
          )}
          <View style={[row.wrap, { marginTop: 8 }]}>
            {simulated && viewerUrl && <DemoTag label="SIMULATED SATELLITE FEED" />}
            {frameIdx != null && analysis && <Pill tone="muted">Frame {frameIdx + 1}/{analysis.frames.length} · {fmtTime(analysis.frames[frameIdx].acquired_at)}</Pill>}
          </View>
          {sourceLabel && <T v="mono" style={{ marginTop: 4 }}>{sourceLabel}</T>}
        </View>
      </Card>

      {/* Band tracking */}
      <Card tone={tr?.moving_toward_buffalo ? "accent" : undefined} style={tr?.moving_toward_buffalo ? { backgroundColor: c.panel2 } : undefined}>
        {tr?.band_detected ? (
          <View style={row.between}>
            <View style={{ flex: 1 }}>
              <T v="mono" color={c.accent}>SNOW BAND DETECTED</T>
              <T v="h3">Moving {compass(tr.heading_deg)} · ~{tr.speed_kph ?? "?"} km/h</T>
              <T v="small">{tr.moving_toward_buffalo ? `Headed for North Campus · ${tr.distance_km ?? "?"} km out` : "Not on a track toward campus"}</T>
              <T v="mono" style={{ marginTop: 4 }}>{tr.method}</T>
            </View>
            {eta != null && tr.moving_toward_buffalo && (
              <View style={{ alignItems: "flex-end" }}>
                <T v="big" color={c.accent}>{eta >= 60 ? `${Math.floor(eta / 60)}h ${String(Math.round(eta % 60)).padStart(2, "0")}m` : `${Math.round(eta)}m`}</T>
                <T v="small">until arrival</T>
              </View>
            )}
          </View>
        ) : (
          <View style={row.gap}><CloudSnow size={18} color={c.muted} /><T v="body">No qualifying snow band in the latest frame.</T></View>
        )}
      </Card>

      {/* Auto switch */}
      <Card kicker="ICE SEASON AUTO-SWITCH" right={<Pill tone={state?.mode === "ice" ? "orange" : state?.mode === "watch" ? "accent" : "muted"}>
        {state?.mode === "ice" ? "ENGAGED" : state?.mode === "watch" ? "ARMED" : "STANDBY"}</Pill>}>
        <T v="body">{state?.reason}</T>
        <T v="small" style={{ marginTop: 6 }}>
          Rule: a band ETA under {threshold} min, confirmed by a NWS winter alert, switches the app to ice season. Then bay capacity drops, leave-by gets extra minutes, and ice scans unlock.
        </T>
        <T v="mono" style={{ marginTop: 6 }}>{state?.source_label?.toUpperCase()}</T>
      </Card>

      <View style={row.gap}>
        <Button title="Analyze now" variant="ghost" icon={<RefreshCw size={15} color={c.ink} />} onPress={() => run("analyze")} loading={busy === "analyze"} style={{ flex: 1 }} />
        <Button title="Demo storm replay" variant="warn" icon={<Play size={15} color={c.orange} />} onPress={() => run("storm")} loading={busy === "storm"} style={{ flex: 1 }} />
      </View>
      {analysis?.live_source_status && <T v="small">Live feed: {analysis.live_source_status}</T>}

      {/* Weather */}
      <Card kicker="NATIONAL WEATHER SERVICE" title={weather?.source_label}>
        {weather?.observation ? (
          <View style={row.gap}>
            <T v="h2">{weather.observation.temperature_c != null ? `${Math.round(weather.observation.temperature_c)}°C` : "—"}</T>
            <T v="small">{weather.observation.condition} · wind {weather.observation.wind_kph ?? "—"} km/h · {weather.observation.station}</T>
            {weather.observation_is_demo && <DemoTag />}
          </View>
        ) : <T v="small">No current observation available.</T>}
        {weather?.alerts.length ? weather.alerts.map((a) => (
          <View key={a.id} style={[row.gap, { marginTop: 8, alignItems: "flex-start" }]}>
            <TriangleAlert size={15} color={a.winter ? c.orange : c.muted} />
            <View style={{ flex: 1 }}>
              <View style={row.gap}><T v="h3">{a.event}</T>{a.demo && <DemoTag />}</View>
              <T v="small">{a.headline}</T>
            </View>
          </View>
        )) : <T v="small" style={{ marginTop: 6 }}>No active alerts for UB North Campus.</T>}
        {weather?.errors.length ? <ErrorNote>{weather.errors.join(" · ")}</ErrorNote> : null}
      </Card>

      {/* Timeline */}
      <Card kicker="OBSERVATION TIMELINE">
        {!status ? <Loading /> : status.timeline.length === 0 ? <T v="small">No observations yet.</T> :
          status.timeline.map((o) => (
            <View key={o.id} style={[row.between, { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.line }]}>
              <View style={row.gap}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: o.band_detected ? c.orange : c.muted }} />
                <T v="body">{fmtTime(o.acquired_at)}</T>
                {o.is_demo && <DemoTag label={o.source === "simulated" ? "SIM" : "DEMO"} />}
              </View>
              <T v="small">{o.band_detected ? `band${o.eta_minutes != null ? ` · ETA ${Math.round(o.eta_minutes)}m` : ""}` : "clear"}</T>
            </View>
          ))}
      </Card>
    </Screen>
  );
}
