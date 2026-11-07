import { LocateFixed } from "lucide-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import type { LocateResult } from "../api";
import { methodLabel, type LocateStatus } from "../location";
import { useStore } from "../store";
import { font } from "../theme";
import { Pill, T, row } from "./ui";

/** One-line GPS status + "Locate me" button. Honest about how the match was made. */
export default function GpsRow({ status, result, error, onLocate, matchedName, label, showConfidence = true }: {
  status: LocateStatus; result: LocateResult | null; error: string | null; onLocate: () => void; matchedName?: string | null;
  /** Replaces the default lot-match wording once a fix is in. */
  label?: string; showConfidence?: boolean;
}) {
  const { c } = useStore();
  const text =
    status === "locating" ? "Finding you…"
      : status === "denied" ? "Location permission off. Pick by hand, or enable it in Settings."
        : status === "error" ? error ?? "Couldn't get a GPS fix."
          : result ? label ?? (matchedName ? `${methodLabel(result)} · ${matchedName}` : methodLabel(result))
            : "Use GPS to pick automatically";
  return (
    <View style={[row.between, { marginBottom: 10 }]}>
      <View style={[row.gap, { flex: 1 }]}>
        {status === "locating" ? <ActivityIndicator size="small" color={c.accent} /> : <LocateFixed size={15} color={result?.lot ? c.good : c.muted} />}
        <T v="small" style={{ flex: 1 }} color={status === "error" || status === "denied" ? c.orange : undefined}>{text}</T>
        {showConfidence && result?.lot && <Pill tone={result.confidence >= 0.8 ? "good" : "orange"}>{Math.round(result.confidence * 100)}%</Pill>}
      </View>
      <Pressable onPress={onLocate} disabled={status === "locating"} accessibilityRole="button" accessibilityLabel="Locate me"
        style={{ borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8 }}>
        <T v="small" style={{ fontFamily: font.semibold }} color={c.accent}>{result ? "Re-locate" : "Locate me"}</T>
      </Pressable>
    </View>
  );
}
