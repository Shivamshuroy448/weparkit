import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";
import { useStore } from "../store";

/** Brand mark: a planet with a satellite circling it. */
export default function OrbitalBadge({ size = 38 }: { size?: number }) {
  const { c } = useStore();
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 48 48" style={{ position: "absolute" }}>
        <Ellipse cx="24" cy="24" rx="20" ry="8" fill="none" stroke={c.accent} strokeOpacity={0.45} strokeWidth="1.2" transform="rotate(-25 24 24)" />
        <Circle cx="24" cy="24" r="7" fill={c.navy} stroke={c.accent} strokeWidth="1.5" />
        <Path d="M19 22 Q24 18 29 22" fill="none" stroke={c.accent} strokeOpacity={0.7} strokeWidth="1" />
      </Svg>
      <Animated.View style={{ position: "absolute", width: size, height: size, transform: [{ rotate }] }}>
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <Rect x="40" y="3" width="4" height="4" fill={c.orange} />
          <Rect x="35.5" y="4" width="4" height="2" fill={c.cyan} />
          <Rect x="44.5" y="4" width="3" height="2" fill={c.cyan} />
        </Svg>
      </Animated.View>
    </View>
  );
}
