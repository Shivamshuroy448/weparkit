import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { api, type Mode } from "../api";
import { useStore } from "../store";
import { space } from "../theme";
import { Badge, Card, DemoTag, Segmented, T, row } from "./ui";

type Choice = "auto" | "standard" | "ice";

export const modeLabel = (m?: Mode | null) => (m === "ice" ? "Ice season" : m === "watch" ? "Storm watch" : "Standard");

/** Current operating mode, why it was chosen, and the demo override control.
 *  "Automatic" clears the manual override; the backend reports overrides separately from satellite decisions. */
export default function ModeToggle() {
  const { c, state, refresh, toast } = useStore();
  const choice: Choice = (state?.manual_override === "ice" ? "ice" : state?.manual_override ? "standard" : "auto");
  const manual = state?.decision_source === "manual_override";

  const set = async (v: Choice) => {
    if (v === choice) return;
    try {
      await api.setMode(v === "auto" ? null : v);
      refresh("state", "lots");
      toast(v === "auto" ? "Mode follows the satellite engine again" : `${modeLabel(v)} set manually (demo override)`, "info");
    } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Card style={{ gap: space.md }}>
      <Pressable onPress={() => router.push("/orbit")} style={[row.between, { alignItems: "flex-start" }]} accessibilityRole="button">
        <View style={{ flex: 1, gap: 4 }}>
          <View style={row.gap}>
            <T v="subheading">{modeLabel(state?.mode)}</T>
            <Badge tone={manual ? "warn" : "neutral"}>{manual ? "Manual override" : state?.demo_active ? "Auto · demo replay" : "Automatic"}</Badge>
            {state?.demo_active && !manual && <DemoTag />}
          </View>
          <T v="caption" numberOfLines={3}>{state?.reason ?? "Waiting for the first satellite analysis."}</T>
        </View>
        <ChevronRight size={18} color={c.textFaint} />
      </Pressable>
      <Segmented<Choice>
        options={[{ value: "auto", label: "Automatic" }, { value: "standard", label: "Standard" }, { value: "ice", label: "Ice season" }]}
        value={choice} onChange={set} />
    </Card>
  );
}
