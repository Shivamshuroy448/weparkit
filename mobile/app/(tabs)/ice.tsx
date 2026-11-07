import { router, useFocusEffect } from "expo-router";
import { Check, Plus, X } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Image, View } from "react-native";
import { api, ago, media, type Route } from "../../src/api";
import CampusMap from "../../src/components/CampusMap";
import Header from "../../src/components/Header";
import { Button, Card, Chips, DemoTag, Empty, Pill, Screen, T, row } from "../../src/components/ui";
import { useStore } from "../../src/store";

const statusTone = (s: Route["status"]) => (s === "blocked" ? "bad" : s === "hazard" ? "orange" : "muted") as "bad" | "orange" | "muted";

export default function IceWatch() {
  const { c, lots, hazards, meta, user, state, refresh, toast } = useStore();
  const [dest, setDest] = useState("Davis Hall");
  const [routes, setRoutes] = useState<(Route & { lot: string; slug: string })[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const loadRoutes = useCallback(async () => {
    try { setRoutes((await api.routes(dest)).routes); } catch (e) { toast((e as Error).message, "error"); }
  }, [dest, toast]);
  useFocusEffect(useCallback(() => { loadRoutes(); }, [loadRoutes, hazards]));

  const vote = async (id: number, kind: "confirm" | "clear") => {
    if (!user) return;
    setBusy(id);
    try {
      const r = kind === "confirm" ? await api.vote(id, user.id, "confirm") : await api.clearHazard(id, user.id);
      toast(r.cleared ? "Pin cleared for everyone. Thanks, cadet." : kind === "confirm" ? `Confirmed. Pin timer restarted. +${r.points_awarded} XP` : `Clear vote counted. +${r.points_awarded} XP`);
      refresh("hazards", "crew", "notifications");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(null); }
  };

  return (
    <Screen header={<Header kicker={state?.mode === "ice" ? "ICE SEASON ACTIVE" : "ICE WATCH"} title="Walkway safety" />} onRefresh={() => refresh("hazards")}>
      {state?.mode === "ice" && (
        <Card tone="warn"><T v="body" color={c.orange}>Ice season is on. Walk times are slower and unreported paths may be icy. Report what you see.</T></Card>
      )}
      <Button title="Report a hazard" icon={<Plus size={16} color={c.bg} />} onPress={() => router.push({ pathname: "/scan", params: { mode: "ice" } })} />

      {lots && <CampusMap lots={lots.lots} hazards={hazards} meta={meta} height={280} />}

      <Card kicker="ACCESSIBLE ROUTE CHECK" title="From each lot to your building">
        <Chips options={(meta?.buildings ?? []).map((b) => ({ value: b.name, label: b.name }))} value={dest} onChange={setDest} />
        <View style={{ marginTop: 10, gap: 8 }}>
          {routes.map((r) => (
            <View key={r.slug} style={[row.between, { alignItems: "flex-start" }]}>
              <View style={{ flex: 1 }}>
                <T v="h3">{r.lot}</T>
                <T v="small">{r.label}</T>
              </View>
              <Pill tone={statusTone(r.status)}>{r.status === "blocked" ? "HARD STOP" : r.status === "hazard" ? "HAZARD" : "UNVERIFIED"}</Pill>
            </View>
          ))}
        </View>
        <T v="mono" style={{ marginTop: 10 }}>ROUTES ARE NEVER MARKED SAFE WITHOUT DATA. BLOCKED CURB RAMPS ARE HARD STOPS FOR WHEELCHAIRS.</T>
      </Card>

      <T v="h3">Active hazards ({hazards.length})</T>
      {hazards.length === 0 ? (
        <Empty title="No active hazard pins">Spotted ice, slush or a blocked ramp? Report it so the crew can route around it.</Empty>
      ) : hazards.map((h) => (
        <Card key={h.id} tone={h.category === "blocked_ramp" || h.category === "ice" ? "warn" : undefined}>
          <View style={row.between}>
            <View style={row.gap}>
              <T v="h3" color={h.category === "blocked_ramp" ? c.bad : c.orange}>{h.category_label}</T>
              {h.is_demo && <DemoTag />}
            </View>
            <T v="mono">{Math.round(h.confidence * 100)}% · {h.minutes_left} MIN LEFT</T>
          </View>
          <T v="body">{h.location_name}</T>
          <T v="small">Reported {ago(h.created_at)} · {h.confirmations} confirm · {h.clear_votes} clear · {h.classified_by.replace("_", " ")}</T>
          {h.hard_stop_for_wheelchairs && <T v="small" color={c.bad} style={{ marginTop: 4 }}>Hard stop for wheelchair routes.</T>}
          {h.image_url && <Image source={{ uri: media(h.image_url) }} style={{ width: "100%", height: 120, borderRadius: 10, marginTop: 8 }} />}
          <View style={[row.gap, { marginTop: 10 }]}>
            <Button title="Still there" variant="ghost" icon={<Check size={15} color={c.ink} />} onPress={() => vote(h.id, "confirm")} loading={busy === h.id} style={{ flex: 1 }} />
            <Button title="It's clear" variant="ghost" icon={<X size={15} color={c.ink} />} onPress={() => vote(h.id, "clear")} disabled={busy === h.id} style={{ flex: 1 }} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
