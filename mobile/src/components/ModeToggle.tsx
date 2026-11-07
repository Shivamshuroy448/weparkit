import { Pressable, Text, View } from "react-native";
import { api, type Mode } from "../api";
import { useStore } from "../store";
import { font } from "../theme";
import { T } from "./ui";

/** Standard orbit / Ice season switch. Tapping sets a MANUAL override (demo), which the
 *  backend reports separately from satellite-triggered decisions. */
export default function ModeToggle() {
  const { c, state, refresh, toast } = useStore();
  const mode: Mode = state?.mode ?? "standard";
  const set = async (m: Mode) => {
    try {
      await api.setMode(m);
      toast(m === "ice" ? "Ice season on (manual demo override)" : "Standard orbit (manual override)", "info");
      refresh("state", "lots");
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const clear = async () => {
    try { await api.setMode(null); refresh("state", "lots"); toast("Back to automatic satellite control", "info"); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const opt = (m: Mode, label: string) => {
    const on = mode === m || (m === "standard" && mode === "watch");
    const bg = on ? (m === "ice" ? c.orange : c.cyan) : "transparent";
    return (
      <Pressable key={m} onPress={() => set(m)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={{ flex: 1, paddingVertical: 11, borderRadius: 11, backgroundColor: bg, alignItems: "center" }}>
        <Text style={{ color: on ? c.bg : c.muted, fontFamily: font.semibold, fontSize: 13 }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: 4 }}>
        {opt("standard", "Standard orbit")}
        {opt("ice", "Ice season")}
      </View>
      {state && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4 }}>
          <T v="mono" style={{ flex: 1 }}>{state.mode === "watch" ? "WATCH · " : ""}{state.source_label}</T>
          {state.manual_override && (
            <Pressable onPress={clear} hitSlop={8}><T v="mono" color={c.accent}>Return to auto</T></Pressable>
          )}
        </View>
      )}
    </View>
  );
}
