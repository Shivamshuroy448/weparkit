import { router } from "expo-router";
import { Bell, User } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useStore } from "../store";
import { font } from "../theme";
import OrbitalBadge from "./OrbitalBadge";
import { T } from "./ui";

/** Screen header: kicker, title, crew XP chip, and the notification bell. */
export default function Header({ kicker, title }: { kicker: string; title: string }) {
  const { c, user, unread, health } = useStore();
  const live = health?.satellite_source === "goes19_live";
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <OrbitalBadge />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: live ? c.good : c.orange }} />
          <T v="mono" color={c.accent}>{kicker} · {live ? "SATELLITE ONLINE" : "DEMO MODE"}</T>
        </View>
        <T v="h2" style={{ fontSize: 21, fontFamily: font.bold }}>{title}</T>
      </View>
      <Pressable onPress={() => router.push("/crew")} accessibilityLabel="Your crew profile"
        style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: c.line, backgroundColor: c.panel, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
        <User size={13} color={c.accent} />
        <Text style={{ color: c.ink, fontFamily: font.medium, fontSize: 12 }}>{user ? `${user.points.toLocaleString()} XP` : "Cadet"}</Text>
      </Pressable>
      <Pressable onPress={() => router.push("/notifications")} accessibilityLabel={`Notifications, ${unread} new`} hitSlop={8}>
        <Bell size={21} color={c.ink} />
        {unread > 0 && (
          <View style={{ position: "absolute", right: -4, top: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: c.orange, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
            <Text style={{ color: c.bg, fontSize: 10, fontFamily: font.bold }}>{unread > 9 ? "9+" : unread}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}
