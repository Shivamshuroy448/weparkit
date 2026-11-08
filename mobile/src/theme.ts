// Design tokens: deep-space palette. Translucent surfaces sit over the starfield backdrop
// (components/Starfield.tsx). Ice season swaps the accent from star-blue to amber.

const space_ = {
  bg: "#04060E",
  surface: "rgba(13,19,40,0.78)",
  surfaceAlt: "rgba(28,38,72,0.65)",
  surfaceSolid: "#0B1124",
  border: "rgba(130,160,255,0.16)",
  divider: "rgba(130,160,255,0.10)",
  text: "#E7ECFF",
  textMuted: "#8D99BD",
  textFaint: "#55618A",
  blue: "#6CC6FF",
  violet: "#8B7CFF",
  amber: "#FFB547",
  success: "#4ADE9B",
  danger: "#FF6B6B",
};

export type Palette = typeof space_ & {
  accent: string; onAccent: string; accentSoft: string;
  warn: string; warnSoft: string; dangerSoft: string; successSoft: string;
  isIce: boolean;
};

export function palette(ice: boolean): Palette {
  return {
    ...space_,
    accent: ice ? space_.amber : space_.blue,
    onAccent: ice ? "#1C1203" : "#03111E",
    accentSoft: ice ? "rgba(255,181,71,0.14)" : "rgba(108,198,255,0.14)",
    warn: space_.amber,
    warnSoft: "rgba(255,181,71,0.14)",
    dangerSoft: "rgba(255,107,107,0.14)",
    successSoft: "rgba(74,222,155,0.14)",
    isIce: ice,
  };
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 };
