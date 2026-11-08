import { router, useFocusEffect } from "expo-router";
import { Car, Minus, Navigation, Plus, Square, Volume2 } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { api, availabilityTone, directionsUrl, hhmm12, sentence, voicePaths, type LotEval, type Recommendation } from "../../src/api";
import FillChart from "../../src/components/FillChart";
import Header from "../../src/components/Header";
import { Badge, Banner, Button, Card, Chips, ErrorNote, Field, IconButton, List, ListRow, Loading, Section, Screen, T, Toggle, row } from "../../src/components/ui";
import { useLotLocator } from "../../src/location";
import { useStore } from "../../src/store";
import { space } from "../../src/theme";
import { useVoice } from "../../src/voice";

const pad = (n: number) => String(n).padStart(2, "0");
const shift = (hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};

export default function Plan() {
  const { c, meta, user, lots, state, refresh, toast, setUser } = useStore();
  const [dest, setDest] = useState("Davis Hall");
  const [arrival, setArrival] = useState<string | null>(null);
  const [accessible, setAccessible] = useState(false);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [leaveLot, setLeaveLot] = useState<number | null>(null);
  const [busy, setBusy] = useState<"leave" | "assist" | null>(null);

  useEffect(() => { if (user) setAccessible(user.needs_accessible_routes); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // If location was already granted, preselect the lot you're in for "Leaving now" (never prompts here).
  const gps = useLotLocator();
  useEffect(() => { if (gps.result?.lot && leaveLot === null) setLeaveLot(gps.result.lot.id); }, [gps.result]); // eslint-disable-line react-hooks/exhaustive-deps
  // Default arrival: the next quarter hour at least 15 minutes out.
  useEffect(() => { if (!arrival && meta) setArrival(shift(meta.campus_time, 30 - (Number(meta.campus_time.slice(3)) % 15))); }, [meta, arrival]);

  const plan = useCallback(async () => {
    if (!arrival) return;
    setLoading(true); setErr(null);
    try { setRec(await api.recommend({ destination: dest, arrival, accessible, user_id: user?.id })); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [dest, arrival, accessible, user?.id]);
  useFocusEffect(useCallback(() => { plan(); }, [plan, lots, state?.mode]));

  const toggleAccessible = async (v: boolean) => {
    setAccessible(v);
    if (user) try { setUser(await api.me(user.id, { needs_accessible_routes: v })); } catch { /* best-effort preference save */ }
  };

  const leaving = async () => {
    if (!leaveLot) return toast("Choose the lot you're leaving first.", "info");
    setBusy("leave");
    try { const r = await api.leave(leaveLot, user?.id); toast(`Drivers heading there have been notified (+${r.points_awarded} pts)`); refresh("lots", "notifications", "crew"); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(null); }
  };
  const stuck = async () => {
    if (!user) return;
    setBusy("assist");
    try { const r = await api.assist({ user_id: user.id, lot_id: leaveLot ?? undefined }); toast(r.message ?? "Help requested"); refresh("notifications"); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(null); }
  };

  return (
    <Screen header={<Header title="Plan" subtitle="Where to park and when to leave" />} onRefresh={plan} refreshing={loading && !!rec}>
      <Section title="Destination">
        <Chips options={(meta?.buildings ?? []).map((b) => ({ value: b.name, label: b.name }))} value={dest} onChange={setDest} />
      </Section>

      <Section title="Arrival">
        <Card padded={false}>
          <List>
            <View style={[row.between, { paddingHorizontal: space.sm, paddingVertical: space.sm }]}>
              <IconButton onPress={() => arrival && setArrival(shift(arrival, -15))} label="15 minutes earlier"><Minus size={20} color={c.text} /></IconButton>
              <View style={{ alignItems: "center" }}>
                <T v="heading" style={{ fontVariant: ["tabular-nums"] }}>{hhmm12(arrival)}</T>
                {rec?.simulated_clock && <T v="caption" color={c.warn}>Simulated clock · now {hhmm12(rec.now)}</T>}
              </View>
              <IconButton onPress={() => arrival && setArrival(shift(arrival, 15))} label="15 minutes later"><Plus size={20} color={c.text} /></IconButton>
            </View>
            <ListRow title="Wheelchair-accessible route" subtitle="Avoids lots whose route has a blocked curb ramp"
              right={<Toggle value={accessible} onChange={toggleAccessible} label="Wheelchair-accessible route" />} />
          </List>
        </Card>
      </Section>

      {err && <ErrorNote>{err}</ErrorNote>}
      {loading && !rec && <Loading label="Calculating" />}

      {rec && (
        <>
          <Section title="Recommendation">
            {rec.best ? <Choice e={rec.best} primary briefing={voicePaths.briefing(dest, arrival ?? undefined, accessible)}
              drive={{ destination: dest, arrival: arrival ?? "", accessible: String(accessible) }} /> : <Banner tone="warn">{rec.explanation}</Banner>}
            {rec.backup && <Choice e={rec.backup} />}
            <T v="caption" style={{ paddingHorizontal: 2 }}>{rec.explanation} {rec.disclaimer}</T>
          </Section>

          {rec.forecast && (
            <Section title={`Forecast · ${rec.forecast.lot}`} footer="Seed occupancy model adjusted by the latest student report. Not UB data.">
              <Card><FillChart series={rec.forecast.series} /></Card>
            </Section>
          )}

          <Section title="All lots">
            <Card padded={false}>
              <List>
                {rec.all.map((e) => (
                  <ListRow key={e.slug} title={e.name}
                    subtitle={`~${e.expected_open_spaces} open · ${Math.round(e.walk_minutes)} min ${e.via_shuttle ? "shuttle" : "walk"}${e.route && e.route.status !== "unverified" ? ` · ${e.route.label}` : ""}`}
                    right={e.accessible_blocked ? <Badge tone="danger">Ramp blocked</Badge> : <Badge tone={availabilityTone(e.label)}>{sentence(e.label)}</Badge>} />
                ))}
              </List>
            </Card>
          </Section>
        </>
      )}

      <Section title="Leaving or stuck?" footer="“Leaving now” alerts drivers heading to that lot. “Request help” notifies students who opted in to help push a stuck car.">
        <Card style={{ gap: space.md }}>
          <T v="caption">
            {gps.result?.lot && leaveLot === gps.result.lot.id ? `Your location matches ${gps.result.lot.name}.` : "Choose your lot."}
          </T>
          <Chips options={(lots?.lots ?? []).map((l) => ({ value: String(l.id), label: l.name }))} value={leaveLot ? String(leaveLot) : null}
            onChange={(v) => setLeaveLot(Number(v))} />
          <View style={row.gap}>
            <Button title="Leaving now" onPress={leaving} loading={busy === "leave"} style={{ flex: 1 }} />
            <Button title="Request help" variant="secondary" onPress={stuck} loading={busy === "assist"} style={{ flex: 1 }} />
          </View>
        </Card>
      </Section>
    </Screen>
  );
}

function Choice({ e, primary, briefing, drive }: { e: LotEval; primary?: boolean; briefing?: string; drive?: Record<string, string> }) {
  const { c, lots, toast } = useStore();
  const voice = useVoice();
  const lot = lots?.lots.find((l) => l.slug === e.slug);
  const speaking = voice.playing === "plan-briefing";
  return (
    <Card style={[{ gap: space.md }, primary ? { borderColor: c.accent } : null]}>
      <View style={row.between}>
        <T v="label">{primary ? "Best option" : "Backup"}</T>
        <Badge tone={availabilityTone(e.label)}>{sentence(e.label)}</Badge>
      </View>
      <View style={[row.between, { alignItems: "flex-end" }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v={primary ? "heading" : "subheading"}>{e.name}</T>
          <T v="caption">~{e.expected_open_spaces} spaces open at arrival</T>
        </View>
        {primary && (
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <T v="caption">Leave by</T>
            <T v="heading" color={c.accent} style={{ fontVariant: ["tabular-nums"] }}>{hhmm12(e.recommended_departure)}</T>
          </View>
        )}
      </View>
      {primary && (
        <View style={row.between}>
          <Field label="Predicted" value={`${Math.round(e.predicted_occupancy * 100)}% full`} />
          <Field label="Chance of a space" value={`${Math.round(e.availability_probability * 100)}%`} />
          <Field label={e.via_shuttle ? "Shuttle" : "Walk"} value={`${Math.round(e.walk_minutes)} min`} />
          <Field label="Searching" value={`~${Math.round(e.search_minutes)} min`} />
        </View>
      )}
      {(e.ice_buffer_minutes > 0 || (e.route && e.route.status !== "unverified")) && (
        <View style={row.wrap}>
          {e.ice_buffer_minutes > 0 && <Badge tone="warn">+{e.ice_buffer_minutes} min ice buffer</Badge>}
          {e.route && e.route.status !== "unverified" && <Badge tone={e.route.status === "blocked" ? "danger" : "warn"}>{e.route.label}</Badge>}
        </View>
      )}
      {primary && (
        <View style={row.gap}>
          <Button title="Directions" icon={<Navigation size={15} color={c.onAccent} />} style={{ flex: 1 }}
            onPress={() => lot && Linking.openURL(directionsUrl(lot.lat, lot.lng)).catch(() => toast("Couldn't open Google Maps.", "error"))} />
          {briefing && (
            <Button title={speaking ? "Stop" : "Listen"} variant="secondary" style={{ flex: 1 }}
              icon={speaking ? <Square size={14} color={c.text} /> : <Volume2 size={16} color={c.text} />}
              onPress={() => (speaking ? voice.stop() : voice.play(briefing, "plan-briefing"))} />
          )}
        </View>
      )}
      {primary && drive && (
        <Button title="Drive mode · hands-free gestures" variant="secondary" icon={<Car size={16} color={c.text} />}
          onPress={() => router.push({ pathname: "/drive", params: drive })} />
      )}
    </Card>
  );
}
