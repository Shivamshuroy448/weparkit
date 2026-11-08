import { View } from "react-native";
import { useStore } from "../store";
import { T, row } from "./ui";

/** Predicted occupancy in 15-minute steps around the arrival time. */
export default function FillChart({ series }: { series: { time: string; occupancy: number; is_arrival: boolean }[] }) {
  const { c } = useStore();
  const H = 88;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: H, gap: 3 }}>
        {series.map((p) => (
          <View key={p.time} style={{ flex: 1, height: Math.max(3, (p.occupancy / 100) * H), borderRadius: 3,
            backgroundColor: p.is_arrival ? c.accent : p.occupancy >= 90 ? c.warn + "73" : c.accent + "40" }} />
        ))}
      </View>
      <View style={row.between}>
        <T v="caption">{series[0]?.time}</T>
        <T v="caption" color={c.accent}>Arrival {series.find((s) => s.is_arrival)?.time}</T>
        <T v="caption">{series[series.length - 1]?.time}</T>
      </View>
    </View>
  );
}
