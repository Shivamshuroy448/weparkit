import { router, useFocusEffect } from "expo-router";
import { Car, Navigation, Square, TriangleAlert, Volume2 } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { api, availabilityTone, directionsUrl, hhmm12, sentence, voicePaths, type Recommendation } from "../../src/api";
import CampusMap from "../../src/components/CampusMap";
import Header from "../../src/components/Header";
import LotRow from "../../src/components/LotCard";
import ModeToggle from "../../src/components/ModeToggle";
import AskCard from "../../src/components/AskCard";
import ParkingStatus from "../../src/components/ParkingStatus";
import { Badge, Banner, Button, Card, DemoTag, Empty, List, Loading, Metrics, Section, Screen, T, row } from "../../src/components/ui";
import { useStore } from "../../src/store";
import { space } from "../../src/theme";
import { useVoice } from "../../src/voice";
import { useParking } from "../../src/parking";
import { metersBetween } from "../../src/parkDetect";

const DEFAULT_DEST = "Davis Hall";

export default function Overview() {
  const { c, lots, state, hazards, weather, meta, refresh, toast } = useStore();
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const pk = useParking();
  // Nearest first when we know where you are; otherwise most open spaces first.
  const sortedLots = useMemo(() => {
    const all = (lots?.lots ?? []).map((lot) => ({ lot, d: pk.position ? Math.round(metersBetween(pk.position, lot)) : null }));
    return all.sort((a, b) => (a.d != null && b.d != null ? a.d - b.d : b.lot.available - a.lot.available));
  }, [lots, pk.position]);
  const voice = useVoice();

  const loadRec = useCallback(async () => {
    try { setRec(await api.recommend({ destination: DEFAULT_DEST, arrival: "", accessible: false })); }
    catch { setRec(null); }
  }, []);
  // Recompute when lots or mode change, or the tab regains focus.
  useFocusEffect(useCallback(() => { loadRec(); }, [loadRec, lots, state?.mode]));

  const onRefresh = async () => { setRefreshing(true); await refresh(); await loadRec(); setRefreshing(false); };
  const reset = async () => {
    try { await api.reset(); await refresh("lots", "state", "hazards", "notifications", "weather", "crew"); toast("Demo data reset"); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  const t = lots?.totals;
  const best = rec?.best;
  const alerts = weather?.alerts ?? [];

  return (
    <Screen header={<Header brand title="WeParkit" subtitle={`UB North Campus${meta ? ` · ${hhmm12(meta.campus_time)}${meta.simulated_clock ? " (simulated clock)" : ""}` : ""}`} />}
      onRefresh={onRefresh} refreshing={refreshing}>

      <ParkingStatus />

      <AskCard destination={DEFAULT_DEST} />

      <Section title="UB parking map" footer="Numbers are estimated open spaces. Tap a lot for Google Maps directions.">
        {lots ? <CampusMap lots={lots.lots} hazards={hazards} meta={meta} highlightSlug={best?.slug} height={340} />
          : <Empty title="Map appears once lot data loads" />}
      </Section>

      <Section title={`Recommended for ${DEFAULT_DEST}`}>
        <Card onPress={() => router.push("/dock")} style={{ gap: space.md }}>
          {best ? (
            <>
              <View style={row.between}>
                <T v="caption">Arriving {hhmm12(rec?.arrival_time)}</T>
                <Badge tone={availabilityTone(best.label)}>{sentence(best.label)}</Badge>
              </View>
              <View style={[row.between, { alignItems: "flex-end" }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="heading">{best.name}</T>
                  <T v="caption">~{best.expected_open_spaces} spaces open{state?.mode === "ice" ? " · snow-adjusted" : ""}</T>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <T v="caption">Leave by</T>
                  <T v="heading" color={c.accent} style={{ fontVariant: ["tabular-nums"] }}>{hhmm12(best.recommended_departure)}</T>
                </View>
              </View>
              <View style={row.between}>
                <View style={row.gap}>
                  <Button size="sm" title="Directions" icon={<Navigation size={14} color={c.onAccent} />}
                    onPress={() => { const l = lots?.lots.find((x) => x.slug === best.slug); if (l) Linking.openURL(directionsUrl(l.lat, l.lng)).catch(() => {}); }} />
                  {(
                    <Button size="sm" variant="secondary" title={voice.playing === "briefing" ? "Stop" : "Listen"}
                      icon={voice.playing === "briefing" ? <Square size={13} color={c.text} /> : <Volume2 size={15} color={c.text} />}
                      onPress={() => (voice.playing === "briefing" ? voice.stop() : voice.play(voicePaths.briefing(DEFAULT_DEST), "briefing"))} />
                  )}
                </View>
                <Button size="sm" variant="secondary" title="Drive" icon={<Car size={15} color={c.text} />}
                  onPress={() => router.push({ pathname: "/drive", params: { destination: DEFAULT_DEST } })} />
              </View>
            </>
          ) : <Loading label="Calculating recommendation" />}
        </Card>
      </Section>

      <Section title="Conditions">
        <ModeToggle />
        {alerts.slice(0, 2).map((a) => (
          <Banner key={a.id} tone={a.winter ? "warn" : "neutral"} onPress={() => router.push("/orbit")}
            icon={<TriangleAlert size={18} color={a.winter ? c.warn : c.textMuted} />}
            title={<View style={row.gap}><T v="subheading" color={a.winter ? c.warn : c.text}>{a.event}</T>{a.demo && <DemoTag />}</View>}>
            {a.headline}
          </Banner>
        ))}
      </Section>

      {t && (
        <Metrics items={[
          { label: "Spaces open", value: `~${t.available}` },
          { label: "Occupancy", value: `${Math.round(t.occupancy_pct)}%` },
          { label: "Snow-blocked", value: t.snow_blocked_spaces, color: t.snow_blocked_spaces ? c.warn : undefined },
          { label: "Hazards", value: hazards.length, color: hazards.length ? c.warn : undefined },
        ]} />
      )}

      <Section title={pk.position ? `Nearest UB lots (${lots?.lots.length ?? 0} total)` : `UB lots (${lots?.lots.length ?? 0})`}
        action={{ label: detailed ? "Less detail" : "More detail", onPress: () => setDetailed((d) => !d) }}
        footer={`${lots?.disclaimer ?? ""} Lot outlines © OpenStreetMap contributors.`}>
        {lots ? (
          <Card padded={false}>
            <List>{sortedLots.slice(0, showAll ? undefined : 8).map(({ lot: l, d }) => (
              <LotRow key={l.id} lot={l} detailed={detailed} highlight={l.slug === best?.slug} distanceM={d} />
            ))}</List>
            {sortedLots.length > 8 && (
              <Pressable onPress={() => setShowAll((v) => !v)} style={{ padding: space.lg, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: c.divider }}>
                <T v="label" color={c.accent}>{showAll ? "Show fewer" : `Show all ${sortedLots.length} lots`}</T>
              </Pressable>
            )}
          </Card>
        ) : <Loading label="Loading lots" />}
      </Section>


      <Section title="Demo" footer="Uses a bundled sample photo, a simulated GOES-19 storm and a demo weather alert. Everything simulated is labelled.">
        <Card style={{ gap: space.md }}>
          <View style={{ gap: 2 }}>
            <T v="subheading">Guided walkthrough</T>
            <T v="caption">Scan a lot, replay a lake-effect storm, switch to ice season and see the recommendation update. About a minute.</T>
          </View>
          <View style={row.gap}>
            <Button title="Start" onPress={() => router.push("/demo")} style={{ flex: 1 }} />
            <Button title="Reset data" variant="secondary" onPress={reset} style={{ flex: 1 }} />
          </View>
        </Card>
      </Section>
    </Screen>
  );
}
