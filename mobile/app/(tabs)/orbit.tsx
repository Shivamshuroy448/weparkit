import { useFocusEffect } from "expo-router";
import { CloudSnow, Play, RefreshCw, TriangleAlert } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, View } from "react-native";
import { api, fmtTime, media, minutes, type Analysis, type SatStatus } from "../../src/api";
import Header from "../../src/components/Header";
import { modeLabel } from "../../src/components/ModeToggle";
import { Badge, Banner, Button, Card, DemoTag, Empty, Field, List, ListRow, Loading, Section, Screen, StatusDot, T, row } from "../../src/components/ui";
import { useStore } from "../../src/store";
import { radius, space } from "../../src/theme";

const compass = (deg?: number | null) =>
  deg == null ? "—" : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];

export default function Satellite() {
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

  // Step through the replay frames, then settle on the tracking overlay.
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
      toast(a.state.mode === "ice" ? "Snow band approaching. Ice season is on." : `Analysis complete: ${modeLabel(a.decision.mode).toLowerCase()}`, a.state.mode === "ice" ? "ok" : "info");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(null); }
  };

  const la = status?.latest_analysis;
  const tr = analysis?.track ?? (la ? {
    band_detected: la.band_detected, speed_kph: la.speed_kph, heading_deg: la.heading_deg, moving_toward_buffalo: la.moving_toward_buffalo,
    eta_minutes: la.eta_minutes, distance_km: (la.analysis?.distance_km as number) ?? null, method: (la.analysis?.method as string) ?? "", band_count: la.band_count,
  } : null);
  const viewerUrl = frameIdx != null && analysis ? analysis.frames[frameIdx].image_url
    : analysis?.overlay_url ?? la?.overlay_url ?? status?.live_feed.latest_image_url ?? null;
  const sourceLabel = analysis?.source_label ?? la?.source_label ?? status?.live_feed.label;
  // Only label what's actually on screen: the raw live listing image is real GOES-19 imagery.
  const shownSource = frameIdx != null || analysis ? analysis?.source : la ? la.source : status?.live_feed.latest_image_url ? "goes19_live" : undefined;
  const simulated = shownSource !== undefined && shownSource !== "goes19_live";
  const threshold = status?.threshold_minutes ?? 60;
  const live = status?.live_feed.online;

  return (
    <Screen header={<Header title="Satellite" subtitle="NOAA GOES-19 lake-effect snow tracking" />} onRefresh={load}>
      <Card padded={false}>
        <View style={{ padding: space.lg, gap: 4 }}>
          <View style={row.between}>
            <View style={row.gap}>
              <StatusDot color={live ? c.success : c.warn} />
              <T v="subheading">{live ? "Live feed online" : "Live feed offline"}</T>
            </View>
            {status?.live_feed.latest_acquired_at && <T v="caption">Latest {fmtTime(status.live_feed.latest_acquired_at)}</T>}
          </View>
          {status?.live_feed.error && <T v="caption" color={c.warn}>{status.live_feed.error}. Using a labelled simulated feed.</T>}
        </View>
        {viewerUrl ? (
          <Image source={{ uri: media(viewerUrl) }} style={{ width: "100%", aspectRatio: 1, backgroundColor: "#000" }} />
        ) : (
          <View style={{ aspectRatio: 1, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
            <T v="caption">No analysis yet. Run one below.</T>
          </View>
        )}
        <View style={{ padding: space.md, gap: space.sm }}>
          <View style={row.wrap}>
            {simulated && viewerUrl && <DemoTag label="Simulated satellite feed" />}
            {frameIdx != null && analysis && <Badge>Frame {frameIdx + 1}/{analysis.frames.length} · {fmtTime(analysis.frames[frameIdx].acquired_at)}</Badge>}
          </View>
          {sourceLabel && <T v="caption">{sourceLabel}</T>}
        </View>
      </Card>

      <View style={row.gap}>
        <Button title="Analyze now" variant="secondary" icon={<RefreshCw size={15} color={c.text} />} onPress={() => run("analyze")} loading={busy === "analyze"} style={{ flex: 1 }} />
        <Button title="Replay demo storm" variant="secondary" icon={<Play size={15} color={c.text} />} onPress={() => run("storm")} loading={busy === "storm"} style={{ flex: 1 }} />
      </View>
      {analysis?.live_source_status && <T v="caption">Live feed: {analysis.live_source_status}</T>}

      <Section title="Snow band">
        <Card style={{ gap: space.md }}>
          {tr?.band_detected ? (
            <>
              <View style={row.between}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="subheading">{tr.moving_toward_buffalo ? "Headed for North Campus" : "Not tracking toward campus"}</T>
                  <T v="caption">{tr.method}</T>
                </View>
                {tr.eta_minutes != null && tr.moving_toward_buffalo && (
                  <View style={{ alignItems: "flex-end" }}>
                    <T v="metric" color={c.accent}>{minutes(tr.eta_minutes)}</T>
                    <T v="caption">until arrival</T>
                  </View>
                )}
              </View>
              <View style={row.between}>
                <Field label="Heading" value={compass(tr.heading_deg)} />
                <Field label="Speed" value={`${tr.speed_kph ?? "—"} km/h`} />
                <Field label="Distance" value={`${tr.distance_km ?? "—"} km`} />
              </View>
            </>
          ) : (
            <View style={row.gap}><CloudSnow size={18} color={c.textMuted} /><T v="body" color={c.textMuted}>No qualifying snow band in the latest frame.</T></View>
          )}
        </Card>
      </Section>

      <Section title="Ice season switch" footer={`Turns on when a band is under ${threshold} min away and a National Weather Service winter alert confirms it. Lot capacity drops, departure times get a buffer, and hazard reporting is promoted.`}>
        <Card style={{ gap: space.sm }}>
          <View style={row.between}>
            <T v="subheading">{modeLabel(state?.mode)}</T>
            <Badge tone={state?.mode === "ice" ? "warn" : state?.mode === "watch" ? "accent" : "neutral"}>
              {state?.mode === "ice" ? "Active" : state?.mode === "watch" ? "Watching" : "Standby"}
            </Badge>
          </View>
          <T v="caption">{state?.reason}</T>
          <T v="caption" color={c.textFaint}>{state?.source_label}</T>
        </Card>
      </Section>

      <Section title="Weather" footer={weather?.source_label}>
        <Card padded={false}>
          <List>
            {weather?.observation ? (
              <ListRow title={weather.observation.temperature_c != null ? `${Math.round(weather.observation.temperature_c)}°C · ${weather.observation.condition}` : weather.observation.condition}
                subtitle={`Wind ${weather.observation.wind_kph ?? "—"} km/h · ${weather.observation.station}`}
                right={weather.observation_is_demo ? <DemoTag /> : undefined} />
            ) : <ListRow title="No current observation" />}
            {weather?.alerts.length ? weather.alerts.map((a) => (
              <ListRow key={a.id} left={<TriangleAlert size={16} color={a.winter ? c.warn : c.textMuted} />}
                title={a.event} subtitle={a.headline} right={a.demo ? <DemoTag /> : undefined} />
            )) : <ListRow title="No active alerts for North Campus" />}
          </List>
        </Card>
        {weather?.errors.length ? <Banner tone="danger">{weather.errors.join(" · ")}</Banner> : null}
      </Section>

      <Section title="Recent observations">
        {!status ? <Loading /> : status.timeline.length === 0 ? <Empty title="No observations yet">Run an analysis to record one.</Empty> : (
          <Card padded={false}>
            <List>
              {status.timeline.map((o) => (
                <ListRow key={o.id} left={<StatusDot color={o.band_detected ? c.warn : c.textFaint} />}
                  title={<T v="body" style={{ fontVariant: ["tabular-nums"] }}>{fmtTime(o.acquired_at)}</T>}
                  right={<View style={row.gap}>
                    {o.is_demo && <DemoTag label={o.source === "simulated" ? "Simulated" : "Demo"} />}
                    <T v="caption">{o.band_detected ? `Band${o.eta_minutes != null ? ` · ETA ${minutes(o.eta_minutes)}` : ""}` : "Clear"}</T>
                  </View>} />
              ))}
            </List>
          </Card>
        )}
      </Section>

      <Section title="About GOES-19">
        <Card style={{ flexDirection: "row", borderRadius: radius.lg }}>
          <Field label="Altitude" value="35,786 km" />
          <Field label="Position" value="75.2° W" />
          <Field label="Cadence" value="~5 min" />
        </Card>
      </Section>
    </Screen>
  );
}
