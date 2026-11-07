import { router, useFocusEffect } from "expo-router";
import { Activity, Rocket, RotateCcw, Snowflake, TriangleAlert } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { api, hhmm12, type Recommendation } from "../../src/api";
import CampusMap from "../../src/components/CampusMap";
import Header from "../../src/components/Header";
import LotCard from "../../src/components/LotCard";
import ModeToggle from "../../src/components/ModeToggle";
import { Button, Card, DemoTag, Empty, Loading, Pill, Screen, Stat, T, row } from "../../src/components/ui";
import { useStore } from "../../src/store";

const DEFAULT_DEST = "Davis Hall";

export default function MissionControl() {
  const { c, lots, state, hazards, weather, meta, refresh, toast } = useStore();
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadRec = useCallback(async () => {
    try { setRec(await api.recommend({ destination: DEFAULT_DEST, arrival: "", accessible: false })); }
    catch { setRec(null); }
  }, []);
  // recompute the best bet whenever lots/mode change or the tab regains focus
  useFocusEffect(useCallback(() => { loadRec(); }, [loadRec, lots, state?.mode]));

  const onRefresh = async () => { setRefreshing(true); await refresh(); await loadRec(); setRefreshing(false); };
  const reset = async () => {
    try { await api.reset(); await refresh("lots", "state", "hazards", "notifications", "weather", "crew"); toast("Demo reset. Everything reseeded."); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  const ice = state?.mode === "ice";
  const t = lots?.totals;
  const best = rec?.best;

  return (
    <Screen header={<Header kicker="MISSION CONTROL" title="IceStation UB" />} onRefresh={onRefresh} refreshing={refreshing}>
      <ModeToggle />

      {/* Best bet */}
      <Card tone="accent" style={{ backgroundColor: c.panel2 }}>
        <View style={row.between}>
          <T v="mono">BEST BET · {DEFAULT_DEST.toUpperCase()} {rec ? hhmm12(rec.arrival_time) : ""}</T>
          {best && <Pill tone={best.label === "LIKELY OPEN" ? "accent" : "orange"}>{best.label}</Pill>}
        </View>
        {best ? (
          <>
            <View style={[row.gap, { alignItems: "baseline", marginTop: 6 }]}>
              <T v="h1">{best.name}</T>
              <T v="small">~{best.expected_open_spaces} open{ice ? " · snow-adjusted" : ""}</T>
            </View>
            <View style={[row.between, { marginTop: 8 }]}>
              <T v="body">Launch window: <T v="h3" color={c.accent}>leave by {hhmm12(best.recommended_departure)}</T></T>
              <Pressable onPress={() => router.push("/dock")} hitSlop={8}><T v="small" color={c.accent}>Plan</T></Pressable>
            </View>
          </>
        ) : <Loading label="Computing best bet" />}
      </Card>

      {/* Ice-season / traffic status */}
      {ice ? (
        <Pressable onPress={() => router.push("/orbit")}>
          <Card tone="warn">
            <View style={row.gap}>
              <Snowflake size={20} color={c.orange} />
              <View style={{ flex: 1 }}>
                <View style={row.gap}>
                  <T v="h3" color={c.orange}>Ice season · {state?.decision_source === "manual_override" ? "manual override" : "auto-on by satellite"}</T>
                  {(state?.demo_active || state?.decision_source === "manual_override") && <DemoTag />}
                </View>
                <T v="small">{state?.reason} Bays {Math.round(((t?.snow_blocked_spaces ?? 0) / Math.max(1, t?.total_capacity ?? 1)) * 100)}% smaller.</T>
              </View>
            </View>
          </Card>
        </Pressable>
      ) : (
        <Pressable onPress={() => router.push("/orbit")}>
          <Card>
            <View style={row.gap}>
              <Activity size={18} color={c.accent} />
              <View style={{ flex: 1 }}>
                <T v="h3">Campus traffic: {state?.mode === "watch" ? "watch" : "normal orbit"}</T>
                <T v="small">{state?.reason ?? "Satellite watching Lake Erie."}</T>
              </View>
            </View>
          </Card>
        </Pressable>
      )}

      {/* Totals */}
      {t && (
        <View style={row.wrap}>
          <Stat label="Est. spaces open" value={`~${t.available}`} accent />
          <Stat label="Occupancy" value={`${t.occupancy_pct}%`} />
          <Stat label="Snow-blocked" value={t.snow_blocked_spaces} />
          <Stat label="Active hazards" value={hazards.length} />
        </View>
      )}

      {/* Weather alerts */}
      {weather && weather.alerts.length > 0 && (
        <Card kicker="WEATHER ALERTS" title={`${weather.alerts.length} active`}>
          {weather.alerts.slice(0, 3).map((a) => (
            <View key={a.id} style={[row.gap, { marginTop: 4, alignItems: "flex-start" }]}>
              <TriangleAlert size={15} color={a.winter ? c.orange : c.muted} />
              <View style={{ flex: 1 }}>
                <View style={row.gap}><T v="h3">{a.event}</T>{a.demo && <DemoTag />}</View>
                <T v="small" numberOfLines={2}>{a.headline}</T>
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Docking bays */}
      <View style={row.between}>
        <T v="h3">Docking bays</T>
        <Pressable onPress={() => setExpanded((e) => !e)} hitSlop={8}><T v="small" color={c.accent}>{expanded ? "Compact" : "Full telemetry"}</T></Pressable>
      </View>
      {lots ? lots.lots.map((l) => <LotCard key={l.id} lot={l} detailed={expanded} highlight={l.slug === best?.slug} />)
        : <Loading label="Contacting mission control" />}
      {lots && <T v="mono">* {lots.disclaimer}</T>}

      <T v="h3">Campus map</T>
      {lots ? <CampusMap lots={lots.lots} hazards={hazards} meta={meta} highlightSlug={best?.slug} />
        : <Empty title="Map loads with lot data" />}

      {/* Demo controls */}
      <Card kicker="HACKATHON DEMO" title="Run the whole story in about a minute">
        <T v="small" style={{ marginBottom: 10 }}>
          Scans a bundled sample photo, replays a simulated GOES-19 storm, flips ice season, pins an ice hazard and re-plans parking. Every simulated event is labelled.
        </T>
        <Button title="INITIATE DEEP SPACE DEMO" icon={<Rocket size={17} color={c.bg} />} onPress={() => router.push("/demo")} />
        <Button title="Reset demo" variant="ghost" icon={<RotateCcw size={15} color={c.ink} />} onPress={reset} style={{ marginTop: 8 }} />
      </Card>
    </Screen>
  );
}
