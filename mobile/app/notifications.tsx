import { router } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { ago } from "../src/api";
import { Card, DemoTag, Empty, Screen, T, row } from "../src/components/ui";
import { useStore } from "../src/store";

const KIND_LABEL: Record<string, string> = { leaving: "SPACE OPENING", assist: "CREW ASSIST", hazard: "HAZARD", scan: "LOT UPDATE", ice_season: "ICE SEASON", system: "SYSTEM" };

export default function Notifications() {
  const { c, notifications, markRead } = useStore();
  useEffect(() => { markRead(); }, [markRead]);
  return (
    <Screen header={
      <View style={[row.between, { paddingHorizontal: 16, paddingTop: 12 }]}>
        <T v="h2">Crew feed</T>
        <Pressable onPress={() => router.back()} accessibilityLabel="Close" hitSlop={10}><X size={22} color={c.ink} /></Pressable>
      </View>}>
      {notifications.length === 0 ? <Empty title="Quiet orbit">Scans, hazards, departures and help requests show up here.</Empty> :
        notifications.map((n) => (
          <Card key={n.id} tone={n.kind === "ice_season" || n.kind === "hazard" ? "warn" : undefined}>
            <View style={row.between}>
              <T v="mono" color={n.kind === "ice_season" || n.kind === "hazard" ? c.orange : c.accent}>{KIND_LABEL[n.kind] ?? n.kind.toUpperCase()}</T>
              <View style={row.gap}>{n.is_demo && <DemoTag />}<T v="mono">{ago(n.created_at).toUpperCase()}</T></View>
            </View>
            <T v="h3" style={{ marginTop: 4 }}>{n.title}</T>
            {n.body ? <T v="small">{n.body}</T> : null}
          </Card>
        ))}
    </Screen>
  );
}
