import { View } from "react-native";
import { useStore } from "../store";
import { T } from "./ui";

/** Bar chart of predicted occupancy around the arrival time (pitch slide 5). */
export default function FillChart({ series }: { series: { time: string; occupancy: number; is_arrival: boolean }[] }) {
  const { c } = useStore();
  const H = 96;
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: H, gap: 4 }}>
        {series.map((p) => (
          <View key={p.time} style={{ flex: 1, height: Math.max(4, (p.occupancy / 100) * H), borderRadius: 4,
            backgroundColor: p.is_arrival ? c.accent : p.occupancy >= 90 ? c.orange : c.navy,
            borderWidth: p.is_arrival ? 0 : 1, borderColor: c.line }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        <T v="mono">{series[0]?.time}</T>
        <T v="mono" color={c.accent}>{series.find((s) => s.is_arrival)?.time} arrival</T>
        <T v="mono">{series[series.length - 1]?.time}</T>
      </View>
    </View>
  );
}
