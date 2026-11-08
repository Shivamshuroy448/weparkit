import { router } from "expo-router";
import { Bell, CircleUserRound, X } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { useStore } from "../store";
import Logo from "./Logo";
import { space } from "../theme";
import { IconButton, T } from "./ui";

/** Screen title with notifications and profile actions. Modals pass `onClose` instead. */
export default function Header({ title, subtitle, onClose, brand }: { title: string; subtitle?: string; onClose?: () => void; brand?: boolean }) {
  const { c, unread, toast } = useStore();
  const taps = useRef(0);
  const ping = () => {
    taps.current += 1;
    if (taps.current % 5 === 0) toast("👽 Greetings, earthling. Take me to your parking lot.", "info");
  };
  return (
    <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          {brand && <Pressable onPress={ping} hitSlop={8} accessibilityLabel="IceStation logo"><Logo /></Pressable>}
          <T v="title" numberOfLines={1}>{title}</T>
        </View>
        {subtitle ? <T v="caption" numberOfLines={1} style={{ marginTop: 2 }}>{subtitle}</T> : null}
      </View>
      {onClose ? (
        <IconButton onPress={onClose} label="Close"><X size={22} color={c.text} /></IconButton>
      ) : (
        <>
          <IconButton onPress={() => router.push("/notifications")} label={`Notifications, ${unread} unread`}>
            <Bell size={20} color={c.text} />
            {unread > 0 && (
              <View style={{ position: "absolute", right: 4, top: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: c.danger,
                alignItems: "center", justifyContent: "center", paddingHorizontal: 3, borderWidth: 2, borderColor: c.bg }}>
                <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            )}
          </IconButton>
          <IconButton onPress={() => router.push("/crew")} label="Profile">
            <CircleUserRound size={21} color={c.text} />
          </IconButton>
        </>
      )}
    </View>
  );
}
