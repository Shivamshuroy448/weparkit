import { View } from "react-native";
import MapView, { Circle, Marker, Polygon, type Region } from "react-native-maps";
import type { Hazard, Lot, Meta } from "../api";
import { useStore } from "../store";

// Dark Google map style (Android). iOS uses userInterfaceStyle="dark".
const DARK = [
  { elementType: "geometry", stylers: [{ color: "#0d1329" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a97b8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#080b18" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#233057" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#060914" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
];

export default function CampusMap({ lots, hazards, meta, height = 260, highlightSlug, onPickLocation }: {
  lots: Lot[]; hazards: Hazard[]; meta: Meta | null; height?: number; highlightSlug?: string | null;
  onPickLocation?: (name: string) => void;
}) {
  const { c } = useStore();
  const [lat, lng] = meta?.campus_center ?? [43.0012, -78.788];
  const region: Region = { latitude: lat, longitude: lng, latitudeDelta: 0.012, longitudeDelta: 0.02 };
  return (
    <View style={{ height, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: c.line }}>
      <MapView style={{ flex: 1 }} initialRegion={region} customMapStyle={DARK} userInterfaceStyle="dark"
        showsPointsOfInterests={false} toolbarEnabled={false}>
        {lots.map((l) => {
          const col = l.occupancy_pct >= 95 ? c.orange : c.cyan;
          return (
            <Polygon key={l.id} coordinates={l.polygon.map(([a, b]) => ({ latitude: a, longitude: b }))}
              strokeColor={col} strokeWidth={l.slug === highlightSlug ? 3 : 1.5} fillColor={col + (l.slug === highlightSlug ? "66" : "33")} />
          );
        })}
        {lots.map((l) => (
          <Marker key={`m${l.id}`} coordinate={{ latitude: l.lat, longitude: l.lng }} title={l.name}
            description={`~${l.available} est. open of ${l.snow_adjusted_capacity} · ${l.occupancy_pct}% full`} pinColor={c.cyan} />
        ))}
        {meta?.buildings.map((b) => (
          <Circle key={b.name} center={{ latitude: b.lat, longitude: b.lng }} radius={8} strokeColor={c.muted} fillColor={c.muted} />
        ))}
        {onPickLocation && meta?.hazard_locations.map((h) => (
          <Marker key={h.name} coordinate={{ latitude: h.lat, longitude: h.lng }} title={h.name} description="Tap to report here"
            pinColor="#8A97B8" onCalloutPress={() => onPickLocation(h.name)} onPress={() => onPickLocation(h.name)} />
        ))}
        {hazards.map((h) => (
          <Marker key={`h${h.id}`} coordinate={{ latitude: h.lat, longitude: h.lng }}
            title={`${h.category_label}${h.is_demo ? " (demo)" : ""}`}
            description={`${h.location_name} · ${Math.round(h.confidence * 100)}% · ${h.minutes_left} min left${h.hard_stop_for_wheelchairs ? " · WHEELCHAIR HARD STOP" : ""}`}
            pinColor={h.category === "blocked_ramp" ? c.bad : c.orange} />
        ))}
      </MapView>
    </View>
  );
}
