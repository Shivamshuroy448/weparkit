// Web fallback for CampusMap: react-native-maps has no browser implementation, so on web we draw
// the same data (lot outlines, buildings, hazard pins) as a schematic SVG. Metro picks this file
// automatically for the web platform; native keeps the real map in CampusMap.tsx.
// Plain DOM <svg> (not react-native-svg): its web shapes crash on pressable groups in this version.
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { Hazard, Lot, Meta } from "../api";
import { useStore } from "../store";
import { font } from "../theme";
import { T } from "./ui";

const PAD = 18;

export default function CampusMap({ lots, hazards, meta, height = 260, highlightSlug, onPickLocation }: {
  lots: Lot[]; hazards: Hazard[]; meta: Meta | null; height?: number; highlightSlug?: string | null;
  onPickLocation?: (name: string) => void;
}) {
  const { c } = useStore();
  const [width, setWidth] = useState(360);
  const [sel, setSel] = useState<string | null>(null);

  // Fit every point into the box with an equirectangular projection (fine at campus scale).
  const pts: [number, number][] = [
    ...lots.flatMap((l) => l.polygon as [number, number][]),
    ...(meta?.buildings ?? []).map((b) => [b.lat, b.lng] as [number, number]),
    ...hazards.map((h) => [h.lat, h.lng] as [number, number]),
  ];
  if (!pts.length) return <View style={{ height }} />;
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const spanX = (maxLng - minLng) * k || 1e-6, spanY = maxLat - minLat || 1e-6;
  const scale = Math.min((width - 2 * PAD) / spanX, (height - 2 * PAD) / spanY);
  const ox = (width - spanX * scale) / 2, oy = (height - spanY * scale) / 2;
  const xy = (lat: number, lng: number) => [ox + (lng - minLng) * k * scale, oy + (maxLat - lat) * scale] as const;

  const info = sel ?? (highlightSlug ? lots.find((l) => l.slug === highlightSlug)?.name ?? null : null);
  const selLot = lots.find((l) => l.name === info);
  const selHz = hazards.find((h) => `h${h.id}` === sel);

  return (
    <View style={{ height, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: c.line, backgroundColor: c.panel }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <svg width={width} height={height} style={{ display: "block" }}>
        <rect x={0} y={0} width={width} height={height} fill="#0d1329" />
        {lots.map((l) => {
          const col = l.occupancy_pct >= 95 ? c.orange : c.cyan;
          const hi = l.slug === highlightSlug || l.name === sel;
          const [lx] = xy(l.lat, l.lng);
          const top = Math.min(...l.polygon.map(([a, b]) => xy(a, b)[1]));
          const ly = Math.max(22, top - 6); // labels sit above the outline, not on it
          return (
            <g key={l.id} onClick={() => setSel(l.name)} style={{ cursor: "pointer" }}>
              <polygon points={l.polygon.map(([a, b]) => xy(a, b).join(",")).join(" ")}
                fill={col} fillOpacity={hi ? 0.45 : 0.22} stroke={col} strokeWidth={hi ? 2.5 : 1.2} />
              <text x={lx} y={ly - 11} fill={c.ink} fontSize={10} fontFamily={font.semibold} textAnchor="middle">{l.name}</text>
              <text x={lx} y={ly} fill={col} fontSize={9} fontFamily={font.mono} textAnchor="middle">{`~${l.available} open`}</text>
            </g>
          );
        })}
        {meta?.buildings.map((b) => {
          const [x, y] = xy(b.lat, b.lng);
          return <circle key={b.name} cx={x} cy={y} r={3} fill={c.muted} onClick={() => setSel(b.name)} />;
        })}
        {onPickLocation && meta?.hazard_locations.map((h) => {
          const [x, y] = xy(h.lat, h.lng);
          return <circle key={h.name} cx={x} cy={y} r={6} fill="none" stroke="#8A97B8" strokeWidth={1.5} onClick={() => onPickLocation(h.name)} style={{ cursor: "pointer" }} />;
        })}
        {hazards.map((h) => {
          const [x, y] = xy(h.lat, h.lng);
          return <circle key={h.id} cx={x} cy={y} r={6} fill={h.category === "blocked_ramp" ? c.bad : c.orange} stroke="#080B18" strokeWidth={1.5}
            onClick={() => setSel(`h${h.id}`)} style={{ cursor: "pointer" }} />;
        })}
      </svg>
      <View style={{ position: "absolute", left: 8, right: 8, bottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <Pressable onPress={() => setSel(null)} style={{ backgroundColor: "rgba(8,11,24,0.85)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 1 }}>
          <T v="small">
            {selHz ? `${selHz.category_label}${selHz.is_demo ? " (demo)" : ""} · ${selHz.location_name} · ${selHz.minutes_left} min left`
              : selLot ? `${selLot.name} · ~${selLot.available} est. open of ${selLot.snow_adjusted_capacity} · ${selLot.occupancy_pct}% full`
                : info ?? "Tap a lot or pin"}
          </T>
        </Pressable>
        <T v="mono" style={{ backgroundColor: "rgba(8,11,24,0.85)", paddingHorizontal: 6, borderRadius: 6 }}>SCHEMATIC · WEB</T>
      </View>
    </View>
  );
}
