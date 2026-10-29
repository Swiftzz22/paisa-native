import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View, type ViewStyle } from "react-native";
import Svg, {
  Defs,
  Ellipse,
  Line,
  Mask,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { C } from "./theme";
import { useReduceMotion } from "./useReduceMotion";

/** One leg of the drift; it plays forward then back, so a full loop is twice this. */
const DRIFT_MS = 8000;
const GRID = 28;

/**
 * The Night Ledger backdrop: navy base with rupee-blue light glowing from
 * behind, drifting slowly enough that it reads as ambient rather than motion.
 *
 * Children render above it, so a screen can use this as its root view. Under
 * Reduce Motion the glow holds still where it is.
 */
export function NightBackground({
  children,
  grid = false,
  style,
}: {
  children?: ReactNode;
  /** A faint 28pt grid, fading out from behind the glow. */
  grid?: boolean;
  style?: ViewStyle;
}) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      t.stopAnimation();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: DRIFT_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: DRIFT_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, t]);

  const drift = {
    transform: [
      { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) },
      { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
      { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
    ],
  };

  return (
    <View style={[styles.root, style]}>
      <Animated.View pointerEvents="none" style={[styles.glow, drift]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="nb-main" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={C.accent} stopOpacity={0.42} />
              <Stop offset="1" stopColor={C.accent} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="nb-low" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={C.highlight} stopOpacity={0.2} />
              <Stop offset="1" stopColor={C.highlight} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx="68" cy="26" rx="46" ry="30" fill="url(#nb-main)" />
          <Ellipse cx="18" cy="82" rx="40" ry="26" fill="url(#nb-low)" />
        </Svg>
      </Animated.View>

      {grid ? (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <Pattern id="nb-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
              <Line x1="0" y1="0" x2={GRID} y2="0" stroke="#fff" strokeOpacity={0.04} strokeWidth={1} />
              <Line x1="0" y1="0" x2="0" y2={GRID} stroke="#fff" strokeOpacity={0.04} strokeWidth={1} />
            </Pattern>
            <RadialGradient id="nb-fade" cx="60%" cy="35%" rx="70%" ry="55%">
              <Stop offset="0" stopColor="#fff" stopOpacity={1} />
              <Stop offset="1" stopColor="#fff" stopOpacity={0} />
            </RadialGradient>
            <Mask id="nb-mask">
              <Rect width="100%" height="100%" fill="url(#nb-fade)" />
            </Mask>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#nb-grid)" mask="url(#nb-mask)" />
        </Svg>
      ) : null}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, overflow: "hidden" },
  // Oversized so the drift never shows an edge.
  glow: { position: "absolute", top: "-20%", left: "-20%", right: "-20%", bottom: "-20%" },
});
