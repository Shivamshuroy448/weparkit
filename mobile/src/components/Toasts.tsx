import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../store";
import { font } from "../theme";

export default function Toasts() {
  const { toasts, dismiss, c } = useStore();
  const insets = useSafeAreaInsets();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 12, right: 12, top: insets.top + 8, gap: 8, zIndex: 100 }}>
      {toasts.map((t) => (
        <Pressable key={t.id} onPress={() => dismiss(t.id)}
          style={{ backgroundColor: t.kind === "error" ? "#2A1018" : c.panel2, borderColor: t.kind === "error" ? c.bad : t.kind === "info" ? c.line : c.accent,
            borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 }}>
          <Text style={{ color: t.kind === "error" ? c.bad : c.ink, fontFamily: font.medium, fontSize: 13 }}>{t.text}</Text>
        </Pressable>
      ))}
    </View>
  );
}
