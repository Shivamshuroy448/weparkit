import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { Camera, ImageIcon, Minus, Plus, Send, ShieldCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { api, media, type Hazard, type PickedImage, type Sample, type ScanResult } from "../../src/api";
import GpsRow from "../../src/components/GpsRow";
import Header from "../../src/components/Header";
import { Button, Card, Chips, DemoTag, ErrorNote, Inset, Pill, Screen, Segmented, Stat, T, row } from "../../src/components/ui";
import { useLotLocator } from "../../src/location";
import { useStore } from "../../src/store";

const HAZARD_CATS = [
  { value: "auto", label: "Let AI decide" }, { value: "ice", label: "Ice" }, { value: "slush", label: "Slush" },
  { value: "snow", label: "Snow" }, { value: "unplowed", label: "Unplowed" }, { value: "blocked_ramp", label: "Blocked ramp" },
];

type Source = { kind: "photo"; image: PickedImage } | { kind: "sample"; sample: Sample } | null;

export default function ScanStation() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const { c, lots, meta, user, state, refresh, toast } = useStore();
  const [mode, setMode] = useState<"bay" | "ice">("bay");
  const [lotId, setLotId] = useState<number | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [source, setSource] = useState<Source>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ occupied: 0, open: 0, blocked: 0 });
  const [sent, setSent] = useState(false);
  // ice path
  const [location, setLocation] = useState<string | null>(null);
  const [category, setCategory] = useState("auto");
  const [hazard, setHazard] = useState<Hazard | null>(null);

  useEffect(() => { if (params.mode === "ice") setMode("ice"); }, [params.mode]);
  useEffect(() => { api.samples().then((d) => setSamples(d.samples)).catch(() => {}); }, []);
  useEffect(() => { if (!lotId && lots?.lots.length) setLotId(lots.lots[0].id); }, [lots, lotId]);

  // GPS lot identification. A manual pick always wins over GPS.
  const gps = useLotLocator();
  const [handPicked, setHandPicked] = useState({ lot: false, location: false });
  useEffect(() => {
    const r = gps.result;
    if (!r) return;
    if (r.lot && !handPicked.lot) setLotId(r.lot.id);
    if (r.hazard_location && !handPicked.location) setLocation(r.hazard_location.name);
  }, [gps.result]); // eslint-disable-line react-hooks/exhaustive-deps
  const relocate = () => { setHandPicked({ lot: false, location: false }); gps.locate(); };

  const resetFlow = () => { setResult(null); setHazard(null); setSent(false); setEditing(false); setErr(null); };
  const switchMode = (m: "bay" | "ice") => { setMode(m); setSource(null); resetFlow(); };

  const pick = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast("Permission denied. Enable it in Settings, or use a sample photo.", "error");
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7 };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled && r.assets[0]) {
      const a = r.assets[0];
      resetFlow();
      setSource({ kind: "photo", image: { uri: a.uri, name: a.fileName ?? "scan.jpg", mimeType: a.mimeType ?? "image/jpeg" } });
    }
  };

  const transmit = async () => {
    if (!source) return toast("Take or choose a photo first.", "info");
    setBusy(true); setErr(null);
    try {
      if (mode === "bay") {
        if (!lotId) throw new Error("Pick which lot you're scanning.");
        const r = await api.scan(lotId, source.kind === "photo" ? { file: source.image } : { sample_id: source.sample.id });
        setResult(r);
        setEdit({ occupied: r.occupied_spaces, open: r.estimated_open_spaces, blocked: r.snow_blocked_spaces });
      } else {
        if (!location) throw new Error("Pick where the hazard is.");
        const r = await api.reportHazard({ location_name: location, category, user_id: user?.id,
          ...(source.kind === "photo" ? { file: source.image } : { sample_id: source.sample.id }) });
        if (!r.created) { toast(r.message ?? "No hazard found in that photo.", "info"); return; }
        setHazard(r.hazard!);
        toast(`Hazard pinned for the crew. +${r.points_awarded ?? 0} XP`);
        refresh("hazards", "notifications", "crew");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const beam = async (corrected: boolean) => {
    if (!result || !lotId) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { lot_id: lotId, scan_id: result.scan_id, user_id: user?.id, is_demo: result.sample_is_synthetic };
      if (corrected) Object.assign(body, { occupied_spaces: edit.occupied, open_spaces: edit.open, snow_blocked_spaces: edit.blocked });
      const r = await api.report(body);
      setSent(true); setEditing(false);
      toast(`Beamed to Mission Control. ${r.lot.name}: ~${r.lot.available} open. +${r.points_awarded} XP`);
      refresh("lots", "notifications", "crew");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };

  const lotSamples = samples.filter((s) => (mode === "bay" ? s.kind !== "hazard" : s.kind === "hazard"));
  const preview = source?.kind === "photo" ? source.image.uri : source ? media(source.sample.image_url) : null;
  const lotName = lots?.lots.find((l) => l.id === lotId)?.name;

  return (
    <Screen header={<Header kicker={result || hazard ? "BAY SCANNED" : "SENSOR ARRAY ONLINE"} title="Scan Station" />}>
      <T v="h2">What are we scanning, cadet?</T>
      <Segmented options={[{ value: "bay", label: "Docking bay" }, { value: "ice", label: "Ice path · winter" }]} value={mode} onChange={switchMode} />
      {mode === "ice" && state?.mode !== "ice" && <T v="small">Ice scans are most useful in ice season, but you can report any time.</T>}

      {mode === "bay" ? (
        <Card kicker="WHICH LOT?">
          <GpsRow status={gps.status} result={gps.result} error={gps.error} onLocate={relocate}
            matchedName={gps.result?.lot && gps.result.lot.id === lotId ? gps.result.lot.name : null} />
          <Chips options={(lots?.lots ?? []).map((l) => ({ value: String(l.id), label: l.name }))} value={lotId ? String(lotId) : null}
            onChange={(v) => { setLotId(Number(v)); setHandPicked((p) => ({ ...p, lot: true })); resetFlow(); }} />
          <T v="small" style={{ marginTop: 8 }}>GPS matches you to a lot outline. Wrong lot? Tap the right one.</T>
        </Card>
      ) : (
        <Card kicker="WHERE IS IT?">
          <GpsRow status={gps.status} result={gps.result} error={gps.error} onLocate={relocate} showConfidence={false}
            label={gps.result?.hazard_location
              ? `GPS: ${Math.round(gps.result.hazard_location.distance_m)} m from ${gps.result.hazard_location.name}`
              : gps.result?.on_campus ? "GPS: no named spot within 150 m. Pick the closest." : "GPS: you're not on North Campus"} />
          <Chips options={(meta?.hazard_locations ?? []).map((h) => ({ value: h.name, label: h.name }))} value={location}
            onChange={(v) => { setLocation(v); setHandPicked((p) => ({ ...p, location: true })); }} />
          <T v="mono" style={{ marginTop: 12, marginBottom: 6 }}>HAZARD TYPE</T>
          <Chips options={HAZARD_CATS} value={category} onChange={setCategory} />
        </Card>
      )}

      {/* Photo source */}
      <Card kicker="PHOTO">
        {preview ? (
          <View>
            <Image source={{ uri: preview }} style={{ width: "100%", aspectRatio: 1.5, borderRadius: 12, backgroundColor: "#000" }} resizeMode="contain" />
            {source?.kind === "sample" && <View style={{ marginTop: 6 }}><DemoTag label="SYNTHETIC SAMPLE PHOTO" /></View>}
          </View>
        ) : (
          <View style={{ borderWidth: 1, borderColor: c.line, borderStyle: "dashed", borderRadius: 12, aspectRatio: 1.5, alignItems: "center", justifyContent: "center" }}>
            <T v="mono">{mode === "bay" ? "FIT AS MANY CARS AS YOU CAN" : "SHOW THE WALKING SURFACE"}</T>
          </View>
        )}
        <View style={[row.gap, { marginTop: 10 }]}>
          <Button title="Camera" variant="ghost" icon={<Camera size={16} color={c.ink} />} onPress={() => pick(true)} style={{ flex: 1 }} />
          <Button title="Library" variant="ghost" icon={<ImageIcon size={16} color={c.ink} />} onPress={() => pick(false)} style={{ flex: 1 }} />
        </View>
        {lotSamples.length > 0 && (
          <>
            <T v="mono" style={{ marginTop: 12, marginBottom: 6 }}>OR USE A BUNDLED SAMPLE</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {lotSamples.map((s) => (
                <Pressable key={s.id} onPress={() => { resetFlow(); setSource({ kind: "sample", sample: s }); }}
                  style={{ width: 130, borderWidth: 1, borderColor: source?.kind === "sample" && source.sample.id === s.id ? c.accent : c.line, borderRadius: 10, overflow: "hidden" }}>
                  <Image source={{ uri: media(s.image_url) }} style={{ width: "100%", height: 80 }} />
                  <T v="small" numberOfLines={1} style={{ padding: 6 }}>{s.title}</T>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}
      </Card>

      {err && <ErrorNote>{err}</ErrorNote>}
      {!result && !hazard && (
        <Button title={busy ? "Analysing" : "Transmit scan"} icon={<Send size={16} color={c.bg} />} onPress={transmit} loading={busy} disabled={!source} />
      )}

      {/* Parking result */}
      {result && (
        <>
          <Card tone={result.frame_occupancy_fraction >= 0.85 ? "warn" : "accent"} style={{ alignItems: "center" }}>
            <Ring value={result.estimated_open_spaces} frac={1 - result.frame_occupancy_fraction}
              color={result.frame_occupancy_fraction >= 0.85 ? c.orange : c.accent} />
            <T v="h2" color={result.frame_occupancy_fraction >= 0.85 ? c.orange : c.accent} style={{ marginTop: 10 }}>
              {lotName?.toUpperCase()} · {Math.round(result.frame_occupancy_fraction * 100)}%
            </T>
            <T v="small" style={{ textAlign: "center" }}>
              {result.vehicles_detected} vessels detected{result.unplowed_rows ? ` · ${result.unplowed_rows} unplowed row` : " · plowed"}{result.snow_blocked_spaces ? ` · ${result.snow_blocked_spaces} snow-blocked` : ""}
            </T>
            <View style={{ marginTop: 8 }}><Pill tone="muted">{result.space_method_label}</Pill></View>
          </Card>

          <Card kicker="SHIP COMPUTER">
            <T v="body">{result.explanation}</T>
            <T v="mono" style={{ marginTop: 6 }}>{result.explanation_source.toUpperCase()}</T>
          </Card>

          <View style={row.wrap}>
            <Stat label="Est. open (in frame)" value={result.estimated_open_spaces} accent />
            <Stat label="Snow-blocked" value={result.snow_blocked_spaces} />
            <Stat label="Confidence" value={`${Math.round(result.confidence * 100)}%`} />
          </View>

          <Card kicker="ANNOTATED · PRIVACY-BLURRED">
            <Image source={{ uri: media(result.annotated_image_url) }} style={{ width: "100%", aspectRatio: 1.5, borderRadius: 10, backgroundColor: "#000" }} resizeMode="contain" />
            <View style={[row.gap, { marginTop: 8 }]}>
              <ShieldCheck size={14} color={c.good} />
              <T v="small">{result.privacy.regions_blurred} regions blurred before storage · {result.detector}</T>
            </View>
            {result.detector_note ? <T v="mono" style={{ marginTop: 4 }}>{result.detector_note}</T> : null}
          </Card>

          {editing && (
            <Card kicker="EDIT RESULTS" title="Correct the counts for this photo">
              <Stepper label="Occupied spaces" value={edit.occupied} onChange={(v) => setEdit({ ...edit, occupied: v })} />
              <Stepper label="Open spaces" value={edit.open} onChange={(v) => setEdit({ ...edit, open: v })} />
              <Stepper label="Snow-blocked spaces" value={edit.blocked} onChange={(v) => setEdit({ ...edit, blocked: v })} />
              <Button title="Save corrections and beam" onPress={() => beam(true)} loading={busy} style={{ marginTop: 8 }} />
            </Card>
          )}

          {sent ? (
            <Inset style={{ alignItems: "center", gap: 8 }}>
              <T v="h3" color={c.good}>Beamed to Mission Control</T>
              <T v="small">Every phone updates now. The report expires in 30 minutes.</T>
              <Button title="Scan another" variant="ghost" onPress={() => { setSource(null); resetFlow(); }} />
            </Inset>
          ) : !editing && (
            <>
              <Button title="Beam it to Mission Control" onPress={() => beam(false)} loading={busy} />
              <Button title="Wrong reading? Correct it" variant="ghost" onPress={() => setEditing(true)} />
            </>
          )}
        </>
      )}

      {/* Hazard result */}
      {hazard && (
        <>
          <Card tone="warn" style={{ alignItems: "center" }}>
            <Ring value={`${Math.round(hazard.confidence * 100)}%`} frac={hazard.confidence} color={c.orange} sub="confidence" />
            <T v="h1" color={c.orange} style={{ marginTop: 10 }}>{hazard.category_label.toUpperCase()}</T>
            <T v="small">{hazard.location_name}</T>
          </Card>
          <Card kicker="SHIP COMPUTER">
            <T v="body">{hazard.explanation}</T>
            {hazard.hard_stop_for_wheelchairs && <T v="h3" color={c.bad} style={{ marginTop: 6 }}>Wheelchair crew: avoid this ramp. Routes treat it as a hard stop.</T>}
          </Card>
          <View style={row.wrap}>
            <Stat label="Pin lifetime" value={`${Math.round(hazard.minutes_left / 60)}h`} />
            <Stat label="Classified by" value={hazard.classified_by === "reporter" ? "You" : "AI"} />
          </View>
          {hazard.image_url && <Image source={{ uri: media(hazard.image_url) }} style={{ width: "100%", aspectRatio: 1.5, borderRadius: 12 }} resizeMode="cover" />}
          <Button title="Report another" variant="ghost" onPress={() => { setSource(null); resetFlow(); }} />
        </>
      )}
    </Screen>
  );
}

function Ring({ value, frac, color, sub = "slots left" }: { value: number | string; frac: number; color: string; sub?: string }) {
  const { c } = useStore();
  const r = 52, C = 2 * Math.PI * r;
  return (
    <View style={{ width: 130, height: 130, alignItems: "center", justifyContent: "center" }}>
      <Svg width={130} height={130} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={65} cy={65} r={r} stroke={c.line} strokeWidth={10} fill="none" />
        <Circle cx={65} cy={65} r={r} stroke={color} strokeWidth={10} fill="none" strokeLinecap="round"
          strokeDasharray={`${C * Math.max(0.03, Math.min(1, frac))} ${C}`} />
      </Svg>
      <T v="big">{typeof value === "number" ? `~${value}` : value}</T>
      <T v="mono">{sub}</T>
    </View>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const { c } = useStore();
  return (
    <View style={[row.between, { paddingVertical: 6 }]}>
      <T v="body">{label}</T>
      <View style={row.gap}>
        <Pressable onPress={() => onChange(Math.max(0, value - 1))} accessibilityLabel={`Decrease ${label}`} style={{ padding: 8, borderWidth: 1, borderColor: c.line, borderRadius: 10 }}>
          <Minus size={16} color={c.ink} />
        </Pressable>
        <T v="h2" style={{ minWidth: 36, textAlign: "center" }}>{value}</T>
        <Pressable onPress={() => onChange(value + 1)} accessibilityLabel={`Increase ${label}`} style={{ padding: 8, borderWidth: 1, borderColor: c.line, borderRadius: 10 }}>
          <Plus size={16} color={c.ink} />
        </Pressable>
      </View>
    </View>
  );
}
