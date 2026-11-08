import { Car, Footprints, LogOut, MapPin } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, View } from "react-native";
import { directionsUrl, fmtTime } from "../api";
import { metersBetween } from "../parkDetect";
import { useParking } from "../parking";
import { useStore } from "../store";
import { space } from "../theme";
import { Badge, Button, Card, Chips, StatusDot, T, Toggle, row } from "./ui";

/** Main-page hero: where am I (auto-detected UB lot) and am I parked? */
export default function ParkingStatus() {
  const { c, lots, toast } = useStore();
  const pk = useParking();
  const [picking, setPicking] = useState(false);
  const [pickReason, setPickReason] = useState<string | null>(null);
  const openPicker = (reason: string | null) => { setPickReason(reason); setPicking(true); };
  const parked = async () => {
    const r = await pk.parkHere();
    if (!r.ok) openPicker(r.reason);
  };
  const s = pk.session;
  const here = lots?.lots.find((l) => l.id === pk.hereLotId);
  const near = lots?.lots.find((l) => l.id === pk.nearest?.lotId);
  // The lot "Yes, I'm parked" will use: the one you're inside, else the nearest UB lot within 400 m.
  const target = here ?? (near && pk.nearest && pk.nearest.distanceM <= 400 ? near : undefined);
  // Lot lists: nearest first when we know where you are.
  const byDistance = [...(lots?.lots ?? [])].sort((a, b) => pk.position
    ? metersBetween(pk.position, a) - metersBetween(pk.position, b) : a.name.localeCompare(b.name));

  const where = pk.gps === "starting" ? { icon: <ActivityIndicator size="small" color={c.textMuted} />, text: "Finding your location…" }
    : pk.gps === "denied" ? { icon: <MapPin size={16} color={c.warn} />, text: "Location is off. Turn it on to detect your lot automatically." }
      : pk.gps === "off" ? { icon: <MapPin size={16} color={c.textMuted} />, text: "Location detection is off." }
        : pk.gps === "unavailable" ? { icon: <MapPin size={16} color={c.warn} />, text: "GPS isn't available on this device." }
          : here ? { icon: <MapPin size={16} color={c.success} />, text: `You're in ${here.name}` }
            : pk.onCampus && near ? { icon: <MapPin size={16} color={c.accent} />, text: `On North Campus · ${pk.nearest!.distanceM} m from ${near.name}` }
              : pk.onCampus === false ? { icon: <MapPin size={16} color={c.textMuted} />, text: "You're not on UB North Campus" }
                : { icon: <ActivityIndicator size="small" color={c.textMuted} />, text: "Finding your location…" };

  const findCar = () => {
    const lat = s?.car_lat ?? s?.lot?.lat, lng = s?.car_lng ?? s?.lot?.lng;
    if (lat == null || lng == null) return;
    Linking.openURL(directionsUrl(lat, lng, "walking")).catch(() => toast("Couldn't open Google Maps.", "error"));
  };

  return (
    <Card padded={false} style={{ borderColor: s ? c.success + "77" : c.accent + "55" }}>
      <View style={{ padding: space.lg, gap: space.md }}>
        <View style={row.between}>
          <View style={[row.gap, { flex: 1 }]}>
            {where.icon}
            <T v="label" color={here ? c.success : c.textMuted} style={{ flex: 1 }} numberOfLines={2}>{where.text}</T>
          </View>
          <View style={row.gap}>
            <StatusDot color={s ? c.success : c.textFaint} />
            <T v="caption" color={s ? c.success : c.textMuted}>{s ? "Parked" : "Not parked"}</T>
          </View>
        </View>

        {s ? (
          <>
            <View style={{ gap: 2 }}>
              <View style={row.gap}>
                <T v="heading" style={{ fontSize: 24 }}>Parked at {s.lot?.name}</T>
                {s.source === "auto" && <Badge tone="accent">Auto</Badge>}
              </View>
              <T v="caption">Since {fmtTime(s.started_at)} · your space is counted for everyone</T>
            </View>
            <Button title="I left" icon={<LogOut size={18} color={c.onAccent} />} onPress={() => pk.checkOut("manual")} loading={pk.busy}
              style={{ height: 54 }} />
            <View style={row.gap}>
              <Button title="Find my car" variant="secondary" icon={<Footprints size={16} color={c.text} />} onPress={findCar} style={{ flex: 1 }} />
              <Button title="Wrong lot?" variant="ghost" onPress={() => openPicker(null)} />
            </View>
            {picking && (
              <View style={{ gap: space.sm }}>
                <T v="caption">Move your check-in to:</T>
                <Chips options={byDistance.filter((l) => l.id !== s.lot?.id).map((l) => ({ value: String(l.id), label: l.name }))} value={null}
                  onChange={(v) => { setPicking(false); pk.checkIn(Number(v), "manual"); }} />
              </View>
            )}
          </>
        ) : picking ? (
          <View style={{ gap: space.sm }}>
            {pickReason && <T v="caption" color={c.warn}>{pickReason}</T>}
            <T v="subheading">Which UB lot?</T>
            <Chips options={byDistance.map((l) => ({ value: String(l.id), label: l.name }))} value={null}
              onChange={(v) => { setPicking(false); pk.checkIn(Number(v), "manual"); }} />
            <Button title="Cancel" variant="ghost" size="sm" onPress={() => setPicking(false)} />
          </View>
        ) : (
          <>
            <T v="heading" style={{ fontSize: 24 }}>{target ? `Parked at ${target.name}?` : "Did you just park?"}</T>
            <Button title={pk.locating ? "Finding your lot…" : target ? `Yes, I'm parked at ${target.name}` : "Yes, I'm parked"}
              icon={<Car size={18} color={c.onAccent} />} onPress={() => (target ? pk.checkIn(target.id, "manual") : parked())} loading={pk.busy || pk.locating} style={{ height: 54 }} />
          </>
        )}
      </View>

      <View style={[row.between, { paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: c.divider }]}>
        <View style={{ flex: 1 }}>
          <T v="subheading" style={{ fontSize: 14 }}>Auto-detect parking</T>
          <T v="caption">{pk.autoDetect ? "Checks you in and out automatically while the app is open" : "Off"}</T>
        </View>
        <Toggle value={pk.autoDetect} onChange={(v) => { pk.setAutoDetect(v); }} label="Auto-detect parking" />
      </View>
    </Card>
  );
}
