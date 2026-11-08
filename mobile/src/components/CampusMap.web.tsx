// Web fallback for CampusMap: react-native-maps has no browser implementation, so on web we draw
// the same data (lot outlines, buildings, hazard pins) as a schematic SVG. Metro picks this file
// automatically for the web platform; native keeps the real map in CampusMap.tsx.
// Plain DOM <svg> (not react-native-svg): its web shapes crash on pressable groups in this version.
import { useState } from "react";
import { View } from "react-native";
import { lotFull, type Hazard, type Lot, type Meta } from "../api";
import { useStore } from "../store";
import { radius } from "../theme";
import LotSheet from "./LotSheet";
import { T } from "./ui";

const PAD = 64; // room for lot names centred on edge lots
const FONT = "system-ui, -apple-system, Segoe UI, sans-serif";

export default function CampusMap({ lots, hazards, meta, height = 300, highlightSlug, onPickLocation }: {
  lots: Lot[]; hazards: Hazard[]; meta: Meta | null; height?: number; highlightSlug?: string | null;
  onPickLocation?: (name: string) => void;
}) {
  const { c } = useStore();
  const [width, setWidth] = useState(360);
  const [selId, setSelId] = useState<number | null>(null);
  const [hzId, setHzId] = useState<number | null>(null);

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
  // Leave room at the bottom for the detail sheet.
  const usableH = height - 2 * PAD - 40;
  const scale = Math.min((width - 2 * PAD) / spanX, usableH / spanY);
  const ox = (width - spanX * scale) / 2, oy = PAD + (usableH - spanY * scale) / 2;
  const xy = (lat: number, lng: number) => [ox + (lng - minLng) * k * scale, oy + (maxLat - lat) * scale] as const;

  const sel = lots.find((l) => l.id === selId) ?? null;
  const selHz = hazards.find((h) => h.id === hzId) ?? null;

  return (
    <View style={{ height, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSolid }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <svg width={width} height={height} style={{ display: "block" }} onClick={() => { setSelId(null); setHzId(null); }}>
        <rect x={0} y={0} width={width} height={height} fill={c.surfaceSolid} />
        {lots.map((l) => {
          const col = l.occupancy_pct >= 95 ? c.warn : c.accent;
          const hi = l.id === selId || (selId == null && l.slug === highlightSlug);
          return (
            <polygon key={l.id} points={l.polygon.map(([a, b]) => xy(a, b).join(",")).join(" ")}
              fill={col} fillOpacity={hi ? 0.35 : 0.14} stroke={col} strokeWidth={hi ? 2 : 1}
              onClick={(e) => { e.stopPropagation(); setSelId(l.id); setHzId(null); }} style={{ cursor: "pointer" }} />
          );
        })}
        {meta?.buildings.map((b) => {
          const [x, y] = xy(b.lat, b.lng);
          return <circle key={b.name} cx={x} cy={y} r={3} fill={c.textFaint}><title>{b.name}</title></circle>;
        })}
        {onPickLocation && meta?.hazard_locations.map((h) => {
          const [x, y] = xy(h.lat, h.lng);
          return <circle key={h.name} cx={x} cy={y} r={6} fill="none" stroke={c.textMuted} strokeWidth={1.5}
            onClick={(e) => { e.stopPropagation(); onPickLocation(h.name); }} style={{ cursor: "pointer" }} />;
        })}
        {hazards.map((h) => {
          const [x, y] = xy(h.lat, h.lng);
          return <circle key={h.id} cx={x} cy={y} r={6} fill={h.category === "blocked_ramp" ? c.danger : c.warn} stroke={c.bg} strokeWidth={1.5}
            onClick={(e) => { e.stopPropagation(); setHzId(h.id); setSelId(null); }} style={{ cursor: "pointer" }} />;
        })}
        {/* Lot labels last so they sit above shapes: name + open-space pill */}
        {lots.map((l) => {
          const [x, y] = xy(l.lat, l.lng);
          const full = lotFull(l);
          const on = l.id === selId;
          const label = full ? "Full" : String(l.available);
          const w = 12 + label.length * 7;
          return (
            <g key={`t${l.id}`} onClick={(e) => { e.stopPropagation(); setSelId(l.id); setHzId(null); }} style={{ cursor: "pointer" }}>
              <rect x={x - w / 2} y={y - 10} width={w} height={20} rx={10} fill={on ? c.text : full ? c.warn : c.accent} stroke={c.bg} strokeWidth={2} />
              <text x={x} y={y + 4} fill={on ? c.bg : full ? "#1B1305" : c.onAccent} fontSize={12} fontWeight={700} fontFamily={FONT} textAnchor="middle">{label}</text>
              <text x={x} y={y - 15} fill={c.text} fontSize={11} fontWeight={500} fontFamily={FONT} textAnchor="middle">{l.name}</text>
            </g>
          );
        })}
      </svg>
      {sel ? <LotSheet lot={sel} onClose={() => setSelId(null)} /> : (
        <View pointerEvents="none" style={{ position: "absolute", left: 8, right: 8, bottom: 8, flexDirection: "row", justifyContent: "space-between" }}>
          <T v="caption" style={{ backgroundColor: "rgba(4,6,14,0.85)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
            {selHz ? `${selHz.category_label}${selHz.is_demo ? " (demo)" : ""} · ${selHz.location_name} · ${selHz.minutes_left} min left`
              : "Tap a lot for directions"}
          </T>
          <T v="caption" style={{ backgroundColor: "rgba(4,6,14,0.85)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 }}>Schematic</T>
        </View>
      )}
    </View>
  );
}
