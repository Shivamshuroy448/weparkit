import { Tabs } from "expo-router";
import { CircleDot, ParkingSquare, ScanLine, Satellite, Snowflake, Users } from "lucide-react-native";
import type { ComponentType } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../src/store";
import { font } from "../../src/theme";

type Icon = ComponentType<{ size?: number; color?: string }>;
const TABS: Record<string, { label: string; icon: Icon }> = {
  index: { label: "Control", icon: CircleDot },
  dock: { label: "Dock", icon: ParkingSquare },
  scan: { label: "Scan", icon: ScanLine },
  orbit: { label: "Orbit", icon: Satellite },
  ice: { label: "Ice", icon: Snowflake },
  crew: { label: "Crew", icon: Users },
};

export default function TabLayout() {
  const { c } = useStore();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}
      tabBar={({ state, navigateToTab }) => (
        <View style={{ position: "absolute", left: 12, right: 12, bottom: Math.max(insets.bottom, 10), flexDirection: "row", alignItems: "center",
          backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 22, paddingVertical: 8, paddingHorizontal: 4 }}>
          {state.routes.map((route, i) => {
            const cfg = TABS[route.name];
            if (!cfg) return null;
            const focused = state.index === i;
            const go = () => { if (!focused) navigateToTab(route.key); };
            const Icon = cfg.icon;
            if (route.name === "scan") {
              return (
                <Pressable key={route.key} onPress={go} accessibilityLabel="Scan Station" style={{ flex: 1, alignItems: "center" }}>
                  <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: c.accent, alignItems: "center", justifyContent: "center",
                    marginTop: -30, borderWidth: 4, borderColor: c.bg, shadowColor: c.accent, shadowOpacity: 0.6, shadowRadius: 14, elevation: 8 }}>
                    <Icon size={24} color={c.bg} />
                  </View>
                </Pressable>
              );
            }
            return (
              <Pressable key={route.key} onPress={go} accessibilityRole="tab" accessibilityState={{ selected: focused }}
                style={{ flex: 1, alignItems: "center", gap: 3, paddingVertical: 2 }}>
                <Icon size={19} color={focused ? c.accent : c.muted} />
                <Text style={{ color: focused ? c.accent : c.muted, fontFamily: font.medium, fontSize: 10 }}>{cfg.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="dock" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="orbit" />
      <Tabs.Screen name="ice" />
      <Tabs.Screen name="crew" />
    </Tabs>
  );
}
