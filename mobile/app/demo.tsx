import { router } from "expo-router";

import { CheckCircle2, Circle, XCircle } from "lucide-react-native";

import { useRef, useState } from "react";

import { ActivityIndicator, Image, View } from "react-native";

import { api, hhmm12, media, type Analysis, type Recommendation, type ScanResult } from "../src/api";

import Header from "../src/components/Header";

import { Banner, Button, Card, List, Section, Screen, T, row } from "../src/components/ui";

import { radius, space } from "../src/theme";

import { useStore } from "../src/store";



type Status = "pending" | "running" | "done" | "error";

interface Step { title: string; status: Status; detail?: string; image?: string }



const TITLES = [

  "Read normal parking conditions",

  "Load bundled sample photo (Jarvis A)",

  "Run AI parking analysis",

  "Submit the scan as a lot report",

  "Trigger simulated GOES-19 storm observation",

  "Track snow-band movement toward Buffalo",

  "Activate ice-season mode",

  "Recalculate snow-adjusted capacity",

  "Pin an ice hazard on the campus map",

  "Recalculate best parking recommendation",

  "Summary",

];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));



export default function DemoRunner() {

  const { c, user, refresh } = useStore();

  const [steps, setSteps] = useState<Step[]>(TITLES.map((title) => ({ title, status: "pending" })));

  const [running, setRunning] = useState(false);

  const [summary, setSummary] = useState<string[] | null>(null);

  const cancelled = useRef(false);



  const patch = (i: number, p: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));



  const run = async () => {

    cancelled.current = false;

    setRunning(true); setSummary(null);

    setSteps(TITLES.map((title) => ({ title, status: "pending" })));

    let i = 0;

    const step = async <R,>(fn: () => Promise<R>, detail: (r: R) => string, image?: (r: R) => string | undefined): Promise<R> => {

      if (cancelled.current) throw new Error("Demo cancelled");

      patch(i, { status: "running" });

      const [r] = await Promise.all([fn(), wait(1200)]);

      patch(i, { status: "done", detail: detail(r), image: image?.(r) });

      i += 1;

      return r;

    };

    try {

      await api.reset();

      await api.setMode(null);

      await refresh("lots", "state", "hazards", "notifications", "weather", "crew");

      const me = await api.me(null);



      const before = await step(() => api.lots(), (l) => `${l.totals.available} spaces estimated open across 4 lots · ${l.totals.occupancy_pct}% full · standard mode`);

      const jarvis = before.lots.find((l) => l.slug === "jarvis-a")!;

      await step(async () => api.samples(), () => "Synthetic overhead photo with a calibrated stall map (labelled, not a real UB photo)",

        (d) => media(d.samples.find((s) => s.id === "jarvis_a_winter")?.image_url));

      const scan = await step<ScanResult>(() => api.scan(jarvis.id, { sample_id: "jarvis_a_winter" }),

        (s) => `${s.vehicles_detected} vehicles detected (${s.detector}). ${s.estimated_open_spaces} open, ${s.snow_blocked_spaces} snow-blocked, ${s.unplowed_rows ?? 0} unplowed row · ${Math.round(s.confidence * 100)}% confidence`,

        (s) => media(s.annotated_image_url));

      await step(() => api.report({ lot_id: jarvis.id, scan_id: scan.scan_id, user_id: me.id, is_demo: true }),

        (r) => `Jarvis A now ~${r.lot.available} open of ${r.lot.snow_adjusted_capacity} snow-adjusted (${r.lot.occupancy_pct}% full). All connected devices updated.`);

      await refresh("lots", "notifications");

      const storm = await step<Analysis>(() => api.demoStorm(),

        (a) => `${a.frames.length} SIMULATED frames processed with OpenCV + optical flow. DEMO NWS Lake Effect Snow Warning injected.`,

        (a) => media(a.frames[0]?.image_url));

      await step(async () => storm, (a) => `Band moving ~${a.track.speed_kph} km/h, heading ${a.track.heading_deg}° · ${a.track.distance_km} km out · ETA ${a.track.eta_minutes} min (threshold ${a.state.threshold_minutes})`,

        (a) => media(a.overlay_url));

      await step(async () => storm.state, (s) => `${s.mode === "ice" ? "Ice season" : s.mode} · ${s.source_label}. ${s.reason}`);

      await refresh("state", "weather");

      const after = await step(() => api.lots(), (l) => `Snow-adjusted capacity ${before.totals.snow_adjusted_capacity} → ${l.totals.snow_adjusted_capacity} (−${l.totals.snow_blocked_spaces} spaces). Search times ×1.5.`);

      await refresh("lots");

      const hz = await step(() => api.reportHazard({ location_name: "Jarvis A to Davis Hall walkway", category: "auto", sample_id: "icy_walkway", user_id: me.id, is_demo: true }),

        (r) => r.hazard ? `${r.hazard.category_label} at ${r.hazard.location_name} · ${Math.round(r.hazard.confidence * 100)}% (${r.hazard.classified_by}) · expires in 6 h` : "No hazard created",

        (r) => media(r.hazard?.image_url ?? undefined));

      await refresh("hazards", "notifications");

      const rec = await step<Recommendation>(() => api.recommend({ destination: "Davis Hall", arrival: "", accessible: false, user_id: me.id }),

        (r) => r.best ? `Best: ${r.best.name} · ~${r.best.expected_open_spaces} open · leave by ${hhmm12(r.best.recommended_departure)} (incl. +${r.best.ice_buffer_minutes} min ice buffer). Backup: ${r.backup?.name ?? "none"}.` : r.explanation);

      await step(async () => null, () => "Done.");

      setSummary([

        `Crew scan updated Jarvis A from a photo in seconds.`,

        `Simulated GOES-19 frames showed a lake-effect band ${storm.track.eta_minutes} min from campus; with the DEMO NWS alert the satellite engine switched on ice season automatically.`,

        `Snow-adjusted capacity fell from ${before.totals.snow_adjusted_capacity} to ${after.totals.snow_adjusted_capacity} spaces.`,

        hz.hazard ? `An ice pin now warns walkers between Jarvis A and Davis Hall.` : `Hazard step produced no pin.`,

        rec.best ? `For Davis Hall, WeParkit recommends ${rec.best.name}, leaving by ${hhmm12(rec.best.recommended_departure)}.` : rec.explanation,

      ]);

      await refresh("lots", "state", "hazards", "notifications", "crew");

    } catch (e) {

      patch(i, { status: "error", detail: (e as Error).message });

    } finally {

      setRunning(false);

    }

  };



  const reset = async () => {

    cancelled.current = true;

    await api.reset().catch(() => {});

    await refresh("lots", "state", "hazards", "notifications", "weather", "crew");

    setSteps(TITLES.map((title) => ({ title, status: "pending" })));

    setSummary(null);

  };



  const icon = (s: Status) => s === "done" ? <CheckCircle2 size={18} color={c.success} /> : s === "running" ? <ActivityIndicator size="small" color={c.accent} />

    : s === "error" ? <XCircle size={18} color={c.danger} /> : <Circle size={18} color={c.textFaint} />;



  return (

    <Screen header={<Header title="Guided demo" onClose={() => router.back()} />}>

      <Banner tone="warn" title="Demo data">Uses bundled sample photos, a simulated satellite feed and a demo weather alert. No API keys needed.</Banner>

      <View style={row.gap}>

        <Button title={running ? "Running" : summary ? "Run again" : "Start"} onPress={run} loading={running} style={{ flex: 1 }} />

        <Button title="Reset data" variant="secondary" onPress={reset} disabled={running} style={{ flex: 1 }} />

      </View>



      {summary && (

        <Section title="What happened">

          <Card style={{ gap: space.sm }}>

            {summary.map((l, i) => <T key={i} v="body">• {l}</T>)}

            <Button title="Back to overview" variant="secondary" onPress={() => router.navigate("/")} style={{ marginTop: space.sm }} />

          </Card>

        </Section>

      )}



      <Section title="Steps">

        <Card padded={false}>

          <List>

            {steps.map((s, i) => (

              <View key={i} style={{ padding: space.lg, gap: space.sm, opacity: s.status === "pending" ? 0.5 : 1 }}>

                <View style={[row.gap, { alignItems: "flex-start", gap: space.md }]}>

                  <View style={{ width: 20, alignItems: "center", marginTop: 1 }}>{icon(s.status)}</View>

                  <View style={{ flex: 1, gap: 2 }}>

                    <T v="subheading">{i + 1}. {s.title}</T>

                    {s.detail && <T v="caption" color={s.status === "error" ? c.danger : undefined}>{s.detail}</T>}

                  </View>

                </View>

                {s.image && <Image source={{ uri: s.image }} style={{ width: "100%", aspectRatio: 1.5, borderRadius: radius.md, backgroundColor: c.surfaceAlt }} resizeMode="contain" />}

              </View>

            ))}

          </List>

        </Card>

      </Section>

    </Screen>

  );

}

