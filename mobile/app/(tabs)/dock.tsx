import { useFocusEffect } from "expo-router";
import { Accessibility, Minus, Plus, Timer } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { api, hhmm12, type LotEval, type Recommendation } from "../../src/api";
import FillChart from "../../src/components/FillChart";
import Header from "../../src/components/Header";
import { Button, Card, Chips, ErrorNote, Inset, Loading, Pill, Screen, T, row } from "../../src/components/ui";
import { useLotLocator } from "../../src/location";
import { useStore } from "../../src/store";

const pad = (n: number) => String(n).padStart(2, "0");
const shift = (hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};

export default function DockingControl() {
  const { c, meta, user, lots, state, refresh, toast, setUser } = useStore();
  const [dest, setDest] = useState("Davis Hall");
  const [arrival, setArrival] = useState<string | null>(null);
  const [accessible, setAccessible] = useState(false);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [leaveLot, setLeaveLot] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (user) setAccessible(user.needs_accessible_routes); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // If location is already allowed, pre-select the lot you're standing in for "Leaving now" (never prompts here).
  const gps = useLotLocator();
  useEffect(() => { if (gps.result?.lot && leaveLot === null) setLeaveLot(gps.result.lot.id); }, [gps.result]); // eslint-disable-line react-hooks/exhaustive-deps
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
    if (user) try { setUser(await api.me(user.id, { needs_accessible_routes: v })); } catch { /* preference save is best-effort */ }
  };

  const leaving = async () => {
    if (!leaveLot) return toast("Pick the lot you're leaving first.", "info");
    setBusy("leave");
    try { const r = await api.leave(leaveLot, user?.id); toast(`Crew notified. +${r.points_awarded} XP`); refresh("lots", "notifications", "crew"); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(null); }
  };
  const stuck = async () => {
    if (!user) return;
    setBusy("assist");
    try { const r = await api.assist({ user_id: user.id, lot_id: leaveLot ?? undefined }); toast(r.message ?? "Help requested"); refresh("notifications"); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(null); }
  };

  return (
    <Screen header={<Header kicker="DOCKING CONTROL" title="Plan your approach" />} onRefresh={plan} refreshing={loading && !!rec}>
      <Card kicker="DESTINATION">
        <Chips options={(meta?.buildings ?? []).map((b) => ({ value: b.name, label: b.name }))} value={dest} onChange={setDest} />
      </Card>

      <Card kicker="ARRIVE BY">
        <View style={row.between}>
          <Pressable onPress={() => arrival && setArrival(shift(arrival, -15))} accessibilityLabel="15 minutes earlier" style={{ padding: 10 }}>
            <Minus size={20} color={c.ink} />
          </Pressable>
          <View style={{ alignItems: "center" }}>
            <T v="h1">{hhmm12(arrival)}</T>
            {rec?.simulated_clock && <T v="mono" color={c.orange}>SIMULATED CLOCK · NOW {hhmm12(rec.now)}</T>}
          </View>
          <Pressable onPress={() => arrival && setArrival(shift(arrival, 15))} accessibilityLabel="15 minutes later" style={{ padding: 10 }}>
            <Plus size={20} color={c.ink} />
          </Pressable>
        </View>
        <View style={[row.between, { marginTop: 10 }]}>
          <View style={row.gap}><Accessibility size={16} color={c.accent} /><T v="body">Wheelchair-accessible route</T></View>
          <Switch value={accessible} onValueChange={toggleAccessible} trackColor={{ true: c.accent, false: c.line }} thumbColor={c.ink} />
        </View>
      </Card>

      {err && <ErrorNote>{err}</ErrorNote>}
      {loading && !rec && <Loading label="Calculating trajectories" />}

      {rec && (
        <>
          {rec.best ? <BestCard e={rec.best} title="BEST BET" /> : <ErrorNote>{rec.explanation}</ErrorNote>}
          {rec.backup && <BestCard e={rec.backup} title="BACKUP" compact />}
          <Card kicker="WHY THIS LOT">
            <T v="body">{rec.explanation}</T>
            <T v="mono" style={{ marginTop: 8 }}>{rec.disclaimer.toUpperCase()}</T>
          </Card>
          {rec.forecast && (
            <Card kicker="FILL FORECAST" title={rec.forecast.lot}>
              <FillChart series={rec.forecast.series} />
              <T v="small" style={{ marginTop: 6 }}>Seed occupancy model, shifted by the latest crew report. Not UB data.</T>
            </Card>
          )}
          <Card kicker="ALL LOTS, RANKED">
            {rec.all.map((e) => (
              <View key={e.slug} style={[row.between, { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: c.line }]}>
                <View style={{ flex: 1 }}>
                  <T v="h3">{e.name}</T>
                  <T v="small">~{e.expected_open_spaces} open · {Math.round(e.walk_minutes)} min {e.via_shuttle ? "shuttle" : "walk"} · {e.route?.status === "unverified" ? "route unverified" : e.route?.label}</T>
                </View>
                {e.accessible_blocked ? <Pill tone="bad">Ramp blocked</Pill> : <T v="mono">{e.score}</T>}
              </View>
            ))}
          </Card>
        </>
      )}

      <Card kicker="CREW SIGNALS" title="Leaving or stuck?">
        <T v="small" style={{ marginBottom: 8 }}>
          {gps.result?.lot && leaveLot === gps.result.lot.id ? `GPS puts you in ${gps.result.lot.name}. ` : "Pick your lot. "}
          Leaving now pings drivers heading there; Stuck in orbit alerts crew who opted in to help push.
        </T>
        <Chips options={(lots?.lots ?? []).map((l) => ({ value: String(l.id), label: l.name }))} value={leaveLot ? String(leaveLot) : null}
          onChange={(v) => setLeaveLot(Number(v))} />
        <View style={[row.gap, { marginTop: 12 }]}>
          <Button title="Leaving now" onPress={leaving} loading={busy === "leave"} style={{ flex: 1 }} />
          <Button title="Stuck in orbit!" variant="warn" onPress={stuck} loading={busy === "assist"} style={{ flex: 1 }} />
        </View>
      </Card>
    </Screen>
  );
}

function BestCard({ e, title, compact }: { e: LotEval; title: string; compact?: boolean }) {
  const { c } = useStore();
  return (
    <Card tone={compact ? undefined : "accent"} style={!compact ? { backgroundColor: c.panel2 } : undefined}>
      <View style={row.between}>
        <T v="mono">{title}</T>
        <Pill tone={e.label === "LIKELY OPEN" ? "accent" : e.label === "TIGHT" ? "orange" : "bad"}>{e.label}</Pill>
      </View>
      <View style={[row.gap, { alignItems: "baseline", marginTop: 4 }]}>
        <T v={compact ? "h2" : "h1"}>{e.name}</T>
        <T v="small">~{e.expected_open_spaces} open at arrival</T>
      </View>
      {!compact && (
        <Inset style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Timer size={16} color={c.accent} />
          <T v="body">Launch window: <T v="h3" color={c.accent}>leave by {hhmm12(e.recommended_departure)}</T></T>
        </Inset>
      )}
      <View style={[row.wrap, { marginTop: 10 }]}>
        <Pill tone="muted">{Math.round(e.predicted_occupancy * 100)}% predicted</Pill>
        <Pill tone="muted">{Math.round(e.availability_probability * 100)}% chance of a space</Pill>
        <Pill tone="muted">{Math.round(e.walk_minutes)} min {e.via_shuttle ? "shuttle" : "walk"}</Pill>
        <Pill tone="muted">~{Math.round(e.search_minutes)} min circling</Pill>
        {e.ice_buffer_minutes > 0 && <Pill tone="orange">+{e.ice_buffer_minutes} min ice buffer</Pill>}
      </View>
      {e.route && e.route.status !== "unverified" && (
        <T v="small" color={e.route.status === "blocked" ? c.bad : c.orange} style={{ marginTop: 8 }}>{e.route.label}</T>
      )}
    </Card>
  );
}
