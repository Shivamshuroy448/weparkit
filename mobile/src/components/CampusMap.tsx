import { useState } from "react";
import { Platform, Text, View } from "react-native";
import MapView, { Circle, Marker, Polygon, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { lotFull, type Hazard, type Lot, type Meta } from "../api";
import { useStore } from "../store";
import { radius } from "../theme";
import LotSheet from "./LotSheet";
import { T } from "./ui";

// Dark Google map style (Android). iOS uses userInterfaceStyle="dark".
const DARK = [
  { elementType: "geometry", stylers: [{ color: "#0b1124" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8d99bd" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#04060e" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1c2747" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#04060e" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
];

/** Campus map: lots labelled with open-space counts (tap for Google Maps directions), buildings, hazard pins. */
export default function CampusMap({ lots, hazards, meta, height = 300, highlightSlug, onPickLocation }: {
  lots: Lot[]; hazards: Hazard[]; meta: Meta | null; height?: number; highlightSlug?: string | null;
  onPickLocation?: (name: string) => void;
}) {
  const { c } = useStore();
  const [selId, setSelId] = useState<number | null>(null);
  const sel = lots.find((l) => l.id === selId) ?? null;
  const [lat, lng] = meta?.campus_center ?? [43.0012, -78.788];
  const region: Region = { latitude: lat, longitude: lng, latitudeDelta: 0.012, longitudeDelta: 0.02 };

  return (
    <View style={{ height, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: c.border }}>
      <MapView style={{ flex: 1 }} initialRegion={region} customMapStyle={DARK} userInterfaceStyle="dark"
        // Google Maps on Android (works in Expo Go). iOS Expo Go only ships Apple Maps; directions still open Google Maps.
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        showsPointsOfInterests={false} toolbarEnabled={false}>
        {lots.map((l) => {
          const col = l.occupancy_pct >= 95 ? c.warn : c.accent;
          const hi = l.id === selId || (selId == null && l.slug === highlightSlug);
          return (
            <Polygon key={l.id} coordinates={l.polygon.map(([a, b]) => ({ latitude: a, longitude: b }))} tappable onPress={() => setSelId(l.id)}
              strokeColor={col} strokeWidth={hi ? 2.5 : 1.2} fillColor={col + (hi ? "55" : "26")} />
          );
        })}
        {lots.map((l) => {
          const full = lotFull(l);
          const on = l.id === selId;
          return (
            <Marker key={`m${l.id}-${l.available}-${on}`} coordinate={{ latitude: l.lat, longitude: l.lng }} onPress={() => setSelId(l.id)}
              tracksViewChanges={false} anchor={{ x: 0.5, y: 0.5 }} accessibilityLabel={`${l.name}, ${l.available} open`}>
              <View style={{ backgroundColor: on ? c.text : full ? c.warn : c.accent, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
                borderWidth: 2, borderColor: c.bg }}>
                <Text style={{ color: on ? c.bg : full ? "#1B1305" : c.onAccent, fontSize: 12, fontWeight: "700" }}>{full ? "Full" : l.available}</Text>
              </View>
            </Marker>
          );
        })}
        {meta?.buildings.map((b) => (
          <Circle key={b.name} center={{ latitude: b.lat, longitude: b.lng }} radius={8} strokeColor={c.textMuted} fillColor={c.textMuted} />
        ))}
        {onPickLocation && meta?.hazard_locations.map((h) => (
          <Marker key={h.name} coordinate={{ latitude: h.lat, longitude: h.lng }} title={h.name} description="Tap to report here"
            pinColor={c.textMuted} onCalloutPress={() => onPickLocation(h.name)} onPress={() => onPickLocation(h.name)} />
        ))}
        {hazards.map((h) => (
          <Marker key={`h${h.id}`} coordinate={{ latitude: h.lat, longitude: h.lng }}
            title={`${h.category_label}${h.is_demo ? " (demo)" : ""}`}
            description={`${h.location_name} · ${Math.round(h.confidence * 100)}% · ${h.minutes_left} min left${h.hard_stop_for_wheelchairs ? " · Not passable by wheelchair" : ""}`}
            pinColor={h.category === "blocked_ramp" ? c.danger : c.warn} />
        ))}
      </MapView>
      {sel ? <LotSheet lot={sel} onClose={() => setSelId(null)} /> : (
        <View pointerEvents="none" style={{ position: "absolute", left: 8, bottom: 8, backgroundColor: "rgba(4,6,14,0.85)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
          <T v="caption">Tap a lot for directions</T>
        </View>
      )}
    </View>
  );
}
