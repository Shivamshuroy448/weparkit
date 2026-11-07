// Space mission-control palette from the brief. Ice season swaps the accent to orange.
export const base = {
  bg: "#080B18",
  panel: "#0D1329",
  panel2: "#121B38",
  line: "#233057",
  navy: "#233A65",
  cyan: "#5DE1F2",
  orange: "#FF9A45",
  ink: "#ECF2FF",
  muted: "#8A97B8",
  good: "#6EE7A0",
  bad: "#FF6B6B",
};

export type Palette = typeof base & { accent: string; accentSoft: string; isIce: boolean };

export function palette(ice: boolean): Palette {
  return {
    ...base,
    line: ice ? "#4A342C" : base.line,
    panel2: ice ? "#1A182C" : base.panel2,
    accent: ice ? base.orange : base.cyan,
    accentSoft: ice ? "rgba(255,154,69,0.14)" : "rgba(93,225,242,0.12)",
    isIce: ice,
  };
}

export const font = {
  regular: "SpaceGrotesk_400Regular",
  medium: "SpaceGrotesk_500Medium",
  semibold: "SpaceGrotesk_600SemiBold",
  bold: "SpaceGrotesk_700Bold",
  mono: "SpaceMono_400Regular",
  monoBold: "SpaceMono_700Bold",
};

export const radius = { card: 18, inset: 14, pill: 999 };
