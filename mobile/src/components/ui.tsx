import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/** Space reserved under scroll content for the floating tab bar in app/(tabs)/_layout.tsx. */
export const TAB_BAR_CLEARANCE = 96;
import { useStore } from "../store";
import { font, radius } from "../theme";

/** Full-screen scroll container with pull-to-refresh and the backend-down banner. */
export function Screen({ children, onRefresh, refreshing = false, header }: {
  children: ReactNode; onRefresh?: () => void; refreshing?: boolean; header?: ReactNode;
}) {
  const { c, backendDown } = useStore();
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      <ScrollView
        // Floating tab bar (~64 px + scan button overhang) sits max(inset, 10) above the bottom edge.
        contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_CLEARANCE + Math.max(insets.bottom, 10), gap: 14 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} /> : undefined}
      >
        {backendDown && <ErrorNote>{backendDown}</ErrorNote>}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function T({ children, style, v = "body", color, numberOfLines }: {
  children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number;
  v?: "h1" | "h2" | "h3" | "body" | "small" | "mono" | "monoBold" | "big"; color?: string;
}) {
  const { c } = useStore();
  const s: Record<string, TextStyle> = {
    h1: { fontFamily: font.bold, fontSize: 26, letterSpacing: -0.4 },
    h2: { fontFamily: font.semibold, fontSize: 18 },
    h3: { fontFamily: font.semibold, fontSize: 15 },
    body: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
    small: { fontFamily: font.regular, fontSize: 12, color: c.muted },
    mono: { fontFamily: font.mono, fontSize: 11, color: c.muted, letterSpacing: 0.4 },
    monoBold: { fontFamily: font.monoBold, fontSize: 12, letterSpacing: 0.8 },
    big: { fontFamily: font.semibold, fontSize: 28, fontVariant: ["tabular-nums"] },
  };
  return <Text numberOfLines={numberOfLines} style={[{ color: c.ink }, s[v], color ? { color } : null, style]}>{children}</Text>;
}

export function Card({ children, style, tone, kicker, title, right }: {
  children?: ReactNode; style?: StyleProp<ViewStyle>; tone?: "warn" | "accent"; kicker?: string; title?: string; right?: ReactNode;
}) {
  const { c } = useStore();
  const border = tone === "warn" ? "rgba(255,154,69,0.55)" : tone === "accent" ? c.accent : c.line;
  const bg = tone === "warn" ? "rgba(255,154,69,0.07)" : c.panel;
  return (
    <View style={[{ backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: radius.card, padding: 14 }, style]}>
      {(kicker || title || right) && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 }}>
          <View style={{ flex: 1 }}>
            {kicker && <T v="mono" color={c.accent}>{kicker}</T>}
            {title && <T v="h3" style={{ marginTop: 2 }}>{title}</T>}
          </View>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Inset({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useStore();
  return <View style={[{ backgroundColor: c.panel2, borderColor: c.line, borderWidth: 1, borderRadius: radius.inset, padding: 12 }, style]}>{children}</View>;
}

export function Pill({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "orange" | "muted" | "good" | "bad" }) {
  const { c } = useStore();
  const col = { accent: c.accent, orange: c.orange, muted: c.muted, good: c.good, bad: c.bad }[tone];
  return (
    <View style={{ borderWidth: 1, borderColor: col + "88", backgroundColor: col + "22", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text style={{ color: col, fontFamily: font.semibold, fontSize: 11 }}>{children}</Text>
    </View>
  );
}

export function DemoTag({ label = "DEMO" }: { label?: string }) {
  const { c } = useStore();
  return (
    <View style={{ borderWidth: 1, borderColor: c.orange, backgroundColor: "rgba(255,154,69,0.12)", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, alignSelf: "flex-start" }}>
      <Text style={{ color: c.orange, fontFamily: font.monoBold, fontSize: 10 }}>{label}</Text>
    </View>
  );
}

export function Button({ title, onPress, variant = "primary", disabled, loading, icon, style }: {
  title: string; onPress: () => void; variant?: "primary" | "ghost" | "warn"; disabled?: boolean; loading?: boolean;
  icon?: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useStore();
  const bg = variant === "primary" ? c.accent : variant === "warn" ? "rgba(255,154,69,0.12)" : "transparent";
  const fg = variant === "primary" ? c.bg : variant === "warn" ? c.orange : c.ink;
  const border = variant === "primary" ? c.accent : variant === "warn" ? c.orange : c.line;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [{ backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: radius.inset, paddingVertical: 13, paddingHorizontal: 16,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon}
      <Text style={{ color: fg, fontFamily: font.semibold, fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Bar({ pct, color }: { pct: number; color?: string }) {
  const { c } = useStore();
  const col = color ?? (pct >= 95 ? c.orange : c.accent);
  return (
    <View style={{ height: 6, backgroundColor: c.line, borderRadius: 6, overflow: "hidden" }}>
      <View style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", backgroundColor: col, borderRadius: 6 }} />
    </View>
  );
}

export function Confidence({ value }: { value: number }) {
  const { c } = useStore();
  const col = value >= 0.75 ? c.good : value >= 0.5 ? c.accent : c.orange;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 48 }}><Bar pct={value * 100} color={col} /></View>
      <T v="mono">{Math.round(value * 100)}%</T>
    </View>
  );
}

export function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  const { c } = useStore();
  return (
    <Inset style={{ flex: 1, minWidth: 90 }}>
      <T v="h2" color={accent ? c.accent : undefined} style={{ fontVariant: ["tabular-nums"] }}>{value}</T>
      <T v="small">{label}</T>
    </Inset>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const { c } = useStore();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radius.inset, padding: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: on ? c.accent : "transparent", alignItems: "center" }}>
            <Text style={{ color: on ? c.bg : c.muted, fontFamily: font.semibold, fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chips<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V | null; onChange: (v: V) => void }) {
  const { c } = useStore();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)}
            style={{ borderWidth: 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.panel2, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Text style={{ color: on ? c.accent : c.ink, fontFamily: font.medium, fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  const { c } = useStore();
  return (
    <View style={{ borderWidth: 1, borderStyle: "dashed", borderColor: c.line, borderRadius: radius.inset, padding: 20, alignItems: "center" }}>
      <T v="h3">{title}</T>
      {children && <T v="small" style={{ textAlign: "center", marginTop: 4 }}>{children}</T>}
    </View>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  const { c } = useStore();
  return (
    <View style={{ borderWidth: 1, borderColor: c.bad + "77", backgroundColor: c.bad + "1A", borderRadius: radius.inset, padding: 10 }}>
      <Text style={{ color: c.bad, fontFamily: font.regular, fontSize: 13 }}>{children}</Text>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const { c } = useStore();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 8 }}>
      <ActivityIndicator color={c.accent} />
      {label && <T v="small">{label}</T>}
    </View>
  );
}

export const row = StyleSheet.create({
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  gap: { flexDirection: "row", alignItems: "center", gap: 8 },
}) as { between: ViewStyle; wrap: ViewStyle; gap: ViewStyle };
