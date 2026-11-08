// Small vector illustrations for the space theme. Pure react-native-svg shapes (no pressables),
// so they render on native and web alike.
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, RadialGradient, Stop } from "react-native-svg";
import { useId } from "react";
import { useStore } from "../store";

/** SVG ids must be unique per instance on web (hidden tabs stay mounted). */
export const useSvgId = (name: string) => `${name}${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

const ALIEN_GREEN = "#7CF2A6";

/** Flying saucer with a little alien in the dome and an optional tractor beam. */
export function Ufo({ size = 72, beam = true }: { size?: number; beam?: boolean }) {
  const { c } = useStore();
  const beamId = useSvgId("beam");
  return (
    <Svg width={size} height={size * 0.82} viewBox="0 0 64 52">
      <Defs>
        <LinearGradient id={beamId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.accent} stopOpacity={0.45} />
          <Stop offset="1" stopColor={c.accent} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {beam && <Polygon points="25,27 39,27 52,52 12,52" fill={`url(#${beamId})`} />}
      {/* dome + pilot */}
      <Path d="M21 22 A11 10 0 0 1 43 22 Z" fill={c.accent} fillOpacity={0.18} stroke={c.accent} strokeWidth={1.4} />
      <Circle cx={32} cy={17.5} r={4.2} fill={ALIEN_GREEN} />
      <Ellipse cx={30.4} cy={17.4} rx={1.3} ry={0.8} fill="#04060E" transform="rotate(25 30.4 17.4)" />
      <Ellipse cx={33.6} cy={17.4} rx={1.3} ry={0.8} fill="#04060E" transform="rotate(-25 33.6 17.4)" />
      {/* saucer */}
      <Ellipse cx={32} cy={24} rx={23} ry={6.5} fill={c.surfaceSolid} stroke={c.accent} strokeWidth={1.4} />
      <Ellipse cx={32} cy={22.6} rx={15} ry={2.4} fill={c.accent} fillOpacity={0.12} />
      {[17, 25, 32, 39, 47].map((x) => <Circle key={x} cx={x} cy={25.4} r={1.2} fill={c.accent} />)}
    </Svg>
  );
}

/** Classic grey-green alien head. */
export function Alien({ size = 64 }: { size?: number }) {
  const { c } = useStore();
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Line x1={17} y1={9} x2={13} y2={3} stroke={ALIEN_GREEN} strokeWidth={1.4} />
      <Line x1={31} y1={9} x2={35} y2={3} stroke={ALIEN_GREEN} strokeWidth={1.4} />
      <Circle cx={13} cy={3} r={1.8} fill={c.accent} />
      <Circle cx={35} cy={3} r={1.8} fill={c.accent} />
      <Path d="M24 7 C35 7 40 15 39 23 C38 33 30 42 24 44 C18 42 10 33 9 23 C8 15 13 7 24 7 Z" fill={ALIEN_GREEN} />
      <Ellipse cx={17.5} cy={24} rx={5.6} ry={3.2} fill="#04060E" transform="rotate(32 17.5 24)" />
      <Ellipse cx={30.5} cy={24} rx={5.6} ry={3.2} fill="#04060E" transform="rotate(-32 30.5 24)" />
      <Circle cx={16} cy={23} r={0.9} fill="#FFFFFF" />
      <Circle cx={29} cy={23} r={0.9} fill="#FFFFFF" />
      <Path d="M21 34 Q24 36 27 34" stroke="#04060E" strokeWidth={1.2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/** Ringed planet, used as a backdrop element. */
export function Planet({ size = 140, opacity = 1 }: { size?: number; opacity?: number }) {
  const { c } = useStore();
  const fillId = useSvgId("planet");
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" opacity={opacity}>
      <Defs>
        <RadialGradient id={fillId} cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor={c.violet} stopOpacity={0.9} />
          <Stop offset="1" stopColor="#1A1440" stopOpacity={1} />
        </RadialGradient>
      </Defs>
      <G transform="rotate(-20 50 50)">
        {/* back half of the ring, planet, then front half so the ring wraps around */}
        <Path d="M8 50 A42 11 0 0 1 92 50" fill="none" stroke={c.accent} strokeOpacity={0.35} strokeWidth={2.2} />
        <Circle cx={50} cy={50} r={26} fill={`url(#${fillId})`} />
        <Path d="M30 44 Q50 38 70 44" stroke="#FFFFFF" strokeOpacity={0.08} strokeWidth={3} fill="none" />
        <Path d="M28 56 Q50 50 72 56" stroke="#FFFFFF" strokeOpacity={0.06} strokeWidth={2.5} fill="none" />
        <Path d="M8 50 A42 11 0 0 0 92 50" fill="none" stroke={c.accent} strokeOpacity={0.6} strokeWidth={2.2} />
      </G>
    </Svg>
  );
}
