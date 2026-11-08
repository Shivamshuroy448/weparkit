import { CircleAlert, CircleCheck, Info } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../store";
import { radius, space } from "../theme";

export default function Toasts() {
  const { toasts, dismiss, c } = useStore();
  const insets = useSafeAreaInsets();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: space.lg, right: space.lg, top: insets.top + space.sm, gap: space.sm, zIndex: 100 }}>
      {toasts.map((t) => {
        const Icon = t.kind === "error" ? CircleAlert : t.kind === "info" ? Info : CircleCheck;
        const iconColor = t.kind === "error" ? c.danger : t.kind === "info" ? c.textMuted : c.success;
        return (
          <Pressable key={t.id} onPress={() => dismiss(t.id)} accessibilityRole="alert"
            style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: c.surfaceSolid, borderColor: c.border,
              borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md,
              shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
            <Icon size={18} color={iconColor} />
            <Text style={{ flex: 1, color: c.text, fontSize: 14, lineHeight: 19 }}>{t.text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
