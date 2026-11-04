import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { C, MONO, R, R_INNER } from "./theme";
import { useReduceMotion } from "./useReduceMotion";

/**
 * The sign-in screen's backdrop: the app's own features, floating as glass
 * cards above the glow. Safe to spend, the spending calendar, quick add, undo
 * and Ask, so someone signing in sees what is on the other side.
 *
 * Purely decorative and hidden from VoiceOver. Each card bobs a few points on
 * its own slow cycle; under Reduce Motion they hold still.
 */
export function FeatureCollage({ height, width }: { height: number; width: number }) {
  // Laid out on a 360-wide canvas and scaled, so the composition holds from an
  // SE to a Pro Max rather than spreading apart on the big phones.
  const s = Math.min(width / 360, 1.25);
  const at = (left: number, top: number, rotate: string): ViewStyle => ({
    position: "absolute",
    left: left * s,
    top: top * s,
    transform: [{ rotate }],
  });

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.wrap, { height }]}
    >
      <View style={{ transform: [{ scale: s }], transformOrigin: "top left", width: 360, height: height / s }}>
        <Float delay={0} style={at(18, 58, "-4deg")}>
          <SafeCard />
        </Float>
        <Float delay={1400} style={at(196, 30, "5deg")}>
          <CalendarCard />
        </Float>
        <Float delay={2600} style={at(176, 172, "-2deg")}>
          <AskCard />
        </Float>
        <Float delay={800} style={at(8, 214, "3deg")}>
          <QuickAddCard />
        </Float>
        <Float delay={2000} style={at(64, 312, "-1deg")}>
          <UndoCard />
        </Float>
      </View>

      {/* Fades the collage into the navy so the sign-in text below sits on
          a clean background, whatever the phone's height. */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="fc-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.55" stopColor={C.bg} stopOpacity={0} />
            <Stop offset="1" stopColor={C.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#fc-fade)" />
      </Svg>
    </View>
  );
}

/** A slow, small vertical drift. Ease-in-out sine, so it never snaps or bounces. */
function Float({ delay, style, children }: { delay: number; style: ViewStyle; children: ReactNode }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      v.setValue(0);
      return;
    }
    const half = 3600 + (delay % 1000);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [reduce, delay, v]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            ...((style.transform as object[]) ?? []),
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
          ] as ViewStyle["transform"],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function Glass({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.glass, style]}>{children}</View>;
}

function SafeCard() {
  const size = 46;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <Glass style={{ width: 168, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>Safe to spend today</Text>
        <Text style={styles.big}>₹642</Text>
      </View>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.glassEdge} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={C.highlight}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * 0.38}
        />
      </Svg>
    </Glass>
  );
}

// Four weeks of made-up spend, 0 = a no-spend day.
const HEAT = [
  0.3, 0.7, 0, 0.4, 1, 0.5, 0.2,
  0.5, 0, 0.3, 0.8, 0.4, 0.6, 0,
  0.2, 0.9, 0.4, 0, 0.3, 0.7, 0.5,
  0.6, 0.3, 0.5, 0.2, 0, 0.4, 0.8,
];

function CalendarCard() {
  return (
    <Glass style={{ width: 148 }}>
      <Text style={styles.label}>October</Text>
      <View style={styles.heatGrid}>
        {HEAT.map((h, i) => (
          <View
            key={i}
            style={[
              styles.heatCell,
              h > 0
                ? { backgroundColor: `rgba(59,130,246,${(0.12 + h * 0.7).toFixed(2)})` }
                : styles.heatZero,
            ]}
          />
        ))}
      </View>
      <Text style={[styles.small, { color: C.green }]}>6 no-spend days</Text>
    </Glass>
  );
}

function QuickAddCard() {
  return (
    <Glass style={{ width: 196 }}>
      <Text style={[styles.mono, { color: C.muted }]}>412 zomato upi</Text>
      <View style={styles.chips}>
        <Chip text="₹412" mono />
        <Chip text="Zomato" />
        <Chip text="Food" green />
        <Chip text="UPI" />
      </View>
    </Glass>
  );
}

function AskCard() {
  return (
    <Glass style={{ width: 168 }}>
      <View style={styles.bubble}>
        <Text style={styles.bubbleText}>Food this month?</Text>
      </View>
      <Text style={[styles.big, { fontSize: 20, marginTop: 8 }]}>₹3,840</Text>
      <Text style={styles.small}>mostly Zomato</Text>
    </Glass>
  );
}

function UndoCard() {
  return (
    <Glass style={{ width: 210, flexDirection: "row", alignItems: "center", paddingVertical: 11 }}>
      <Text style={[styles.body, { flex: 1 }]}>Deleted Uber</Text>
      <Text style={styles.undo}>Undo</Text>
    </Glass>
  );
}

function Chip({ text, mono, green }: { text: string; mono?: boolean; green?: boolean }) {
  return (
    <View style={[styles.chip, green && { backgroundColor: C.greenBg, borderColor: "transparent" }]}>
      <Text style={[styles.chipText, mono && { fontFamily: MONO }, green && { color: C.green }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden" },
  glass: {
    padding: 12,
    borderRadius: R_INNER,
    // A touch more opaque than in-app glass: these overlap each other.
    backgroundColor: "rgba(19,23,34,0.82)",
    borderWidth: 1,
    borderColor: C.glassEdge,
    shadowColor: C.accent,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  label: { fontSize: 11, color: C.muted, marginBottom: 4 },
  big: { fontFamily: MONO, fontSize: 24, fontWeight: "600", color: C.text, letterSpacing: -0.5 },
  small: { fontSize: 11, color: C.muted, marginTop: 6 },
  body: { fontSize: 13, color: C.text },
  mono: { fontFamily: MONO, fontSize: 12 },
  undo: { fontSize: 13, color: C.highlight, fontWeight: "600" },
  heatGrid: { flexDirection: "row", flexWrap: "wrap", gap: 3, marginTop: 2 },
  heatCell: { width: 15, height: 15, borderRadius: 4 },
  heatZero: { borderWidth: 1, borderStyle: "dashed", borderColor: C.green },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 8 },
  chip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: R.pill,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.glassEdge,
  },
  chipText: { fontSize: 11, color: C.text },
  bubble: {
    alignSelf: "flex-end",
    backgroundColor: C.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderBottomRightRadius: 3,
  },
  bubbleText: { fontSize: 12, color: "#fff" },
});
