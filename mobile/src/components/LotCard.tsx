import { View } from "react-native";
import { ago, sourceLabel, type Lot } from "../api";
import { useStore } from "../store";
import { Bar, Confidence, DemoTag, Pill, T, row } from "./ui";

/** Compact "docking bay" row in the pitch style, expandable to full telemetry. */
export default function LotCard({ lot, detailed = false, highlight = false }: { lot: Lot; detailed?: boolean; highlight?: boolean }) {
  const { c } = useStore();
  const full = lot.available <= Math.max(2, lot.snow_adjusted_capacity * 0.02);
  return (
    <View style={{ backgroundColor: c.panel2, borderColor: highlight ? c.accent : c.line, borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 }}>
      <View style={row.between}>
        <View style={{ flex: 1 }}>
          <T v="monoBold" color={c.accent}>{lot.name.toUpperCase()}</T>
          <T v="small" numberOfLines={1}>{lot.kind === "park_and_ride" ? "Park & ride" : "Commuter lot"} · {lot.note}</T>
        </View>
        <T v="h2" color={full ? c.orange : c.ink} style={{ fontVariant: ["tabular-nums"] }}>{full ? "Full" : `${lot.available} open`}</T>
      </View>
      <Bar pct={lot.occupancy_pct} />
      {detailed && (
        <>
          <View style={[row.between, { marginTop: 2 }]}>
            <Cell label="Occupied" value={`${lot.occupied} · ${lot.occupancy_pct}%`} />
            <Cell label={`Capacity${lot.capacity_is_seed_estimate ? "*" : ""}`} value={String(lot.total_capacity)} />
            <Cell label="Snow-adjusted" value={`${lot.snow_adjusted_capacity}${lot.snow_blocked_spaces ? ` (−${lot.snow_blocked_spaces})` : ""}`}
              color={lot.snow_blocked_spaces ? c.orange : undefined} />
          </View>
          <View style={row.between}>
            <View style={row.wrap}>
              {lot.data_source === "demo" ? <DemoTag label="DEMO SCAN" /> :
                <Pill tone={lot.data_source === "seed_model" ? "muted" : "accent"}>{sourceLabel(lot.data_source)}</Pill>}
              {lot.pending_departures > 0 && <Pill tone="good">{lot.pending_departures} leaving</Pill>}
              {lot.snow_source === "ice-season default" && <Pill tone="orange">ice −18%</Pill>}
            </View>
            <Confidence value={lot.confidence} />
          </View>
          <T v="mono">{lot.last_update ? `UPDATED ${ago(lot.last_update).toUpperCase()}` : "MODEL ESTIMATE · NO CREW REPORT IN 30 MIN"}</T>
        </>
      )}
    </View>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <T v="small">{label}</T>
      <T v="body" color={color} style={{ fontVariant: ["tabular-nums"] }}>{value}</T>
    </View>
  );
}
