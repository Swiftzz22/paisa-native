import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, MONO, R, R_INNER, SPACE } from "./theme";
import { tapLight, tapSelection } from "./haptics";
import { NightBackground } from "./NightBackground";
import { useReduceMotion } from "./useReduceMotion";

/**
 * Written in terms of what the person gets, not what the app does internally.
 * Someone opening this for the first time has no idea what "ingestion" or
 * "categorisation" mean, and should not have to — so the first two pages show
 * the thing happening rather than describing it.
 */
const PAGES = [
  {
    key: "auto",
    title: "Stop typing in your spending",
    body: "Your bank already emails you every time you tap, swipe or send. paisa. turns those emails into a running record.",
  },
  {
    key: "ask",
    title: "Sorted, then just ask",
    body: "Every transaction lands in a category on its own. Correct one and it remembers. Then ask in plain English.",
  },
  {
    key: "private",
    title: "Yours, and only yours",
    body: "paisa. only ever reads — it can never move money or send anything. Your data is separate from every other user's, and you can disconnect or delete it whenever you want.",
  },
] as const;

const ROWS = [
  { merchant: "Zomato", category: "Food", amount: "₹412" },
  { merchant: "Uber", category: "Transport", amount: "₹186" },
  { merchant: "Netflix", category: "Subs", amount: "₹649" },
];

const STAGGER_MS = 260;

/**
 * Plays `count` entrance values in sequence the first time `active` turns on,
 * so a page animates when it is reached rather than offscreen at launch.
 * Under Reduce Motion everything is simply there.
 */
function useStaggeredEntrance(count: number, active: boolean, onEach?: () => void) {
  const reduce = useReduceMotion();
  const values = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
  const played = useRef(false);

  useEffect(() => {
    if (!active || played.current) return;
    played.current = true;
    if (reduce) {
      values.forEach((v) => v.setValue(1));
      return;
    }
    const timers = values.map((v, i) =>
      setTimeout(() => {
        onEach?.();
        Animated.timing(v, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }, 180 + i * STAGGER_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [active, reduce, values, onEach]);

  return values;
}

/** Slides in from the left and fades up, driven by a 0→1 value. */
function Enter({ v, children }: { v: Animated.Value; children: ReactNode }) {
  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** The app icon's glowing ₹, standing in for a logo. */
function RupeeBadge() {
  return (
    <View style={styles.rupee}>
      <Text style={styles.rupeeText}>₹</Text>
    </View>
  );
}

function IconBadge({ name }: { name: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.rupee}>
      <Ionicons name={name} size={30} color={C.highlight} />
    </View>
  );
}

function AutoDemo({ active }: { active: boolean }) {
  const rows = useStaggeredEntrance(ROWS.length, active, tapSelection);
  return (
    <View style={styles.stack}>
      {ROWS.map((r, i) => (
        <Enter key={r.merchant} v={rows[i]}>
          <View style={styles.row}>
            <Text style={styles.rowText}>
              {r.merchant}
              <Text style={styles.rowMuted}> · {r.category}</Text>
            </Text>
            <Text style={styles.amount}>{r.amount}</Text>
          </View>
        </Enter>
      ))}
    </View>
  );
}

function AskDemo({ active }: { active: boolean }) {
  const [chips, question, answer] = useStaggeredEntrance(3, active);
  return (
    <View style={styles.stack}>
      <Enter v={chips}>
        <View style={styles.chips}>
          {["Food", "Transport", "Subs"].map((c) => (
            <View key={c} style={styles.chip}>
              <Text style={styles.chipText}>{c}</Text>
            </View>
          ))}
        </View>
      </Enter>
      <Enter v={question}>
        <View style={styles.question}>
          <Text style={styles.questionText}>How much did I spend on food this month?</Text>
        </View>
      </Enter>
      <Enter v={answer}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.answerBig}>₹3,840</Text>
            <Text style={styles.rowMuted}>on food in October · mostly Zomato</Text>
          </View>
        </View>
      </Enter>
    </View>
  );
}

/** One-time intro, shown before the sign-in step on a first launch. */
export function WelcomeScreen({ onDone }: { onDone: () => void }) {
  // Measured rather than sampled once. A one-shot read of the window is stale
  // the moment the window changes size — an iPad Split View drag or a foldable
  // opening left the pages laid out for the old width, so slides sat
  // half-offscreen and the dots tracked the wrong page.
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const last = page === PAGES.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page) {
      setPage(next);
      tapSelection();
    }
  };

  const advance = () => {
    tapLight();
    if (last) return onDone();
    scroller.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  return (
    <NightBackground>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <Text style={styles.brand}>
            paisa<Text style={{ color: C.accent }}>.</Text>
          </Text>
          {!last ? (
            <Pressable
              onPress={onDone}
              hitSlop={12}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          style={{ flex: 1 }}
        >
          {PAGES.map((p, i) => (
            <View key={p.key} style={[styles.page, { width }]}>
              {p.key === "auto" ? (
                <RupeeBadge />
              ) : (
                <IconBadge name={p.key === "ask" ? "chatbubble-ellipses-outline" : "lock-closed-outline"} />
              )}
              <Text style={styles.title}>{p.title}</Text>
              <Text style={styles.body}>{p.body}</Text>
              {p.key === "auto" ? <AutoDemo active={page === i} /> : null}
              {p.key === "ask" ? <AskDemo active={page === i} /> : null}
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {PAGES.map((p, i) => (
            <View key={p.key} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={advance}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.ctaText}>{last ? "Get started" : "Next"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </NightBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
    height: 44,
  },
  brand: { fontSize: 20, fontWeight: "700", color: C.text, letterSpacing: -0.3 },
  skip: { fontSize: 15, color: C.muted },
  page: { paddingHorizontal: 32, justifyContent: "center", flex: 1 },
  rupee: {
    width: 72,
    height: 72,
    borderRadius: R.card - 6,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 26,
    backgroundColor: C.badge,
    borderWidth: 1,
    borderColor: C.glassEdge,
    shadowColor: C.accent,
    shadowOpacity: 0.7,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  rupeeText: { fontSize: 34, fontWeight: "700", color: C.highlight },
  title: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "700",
    letterSpacing: -0.6,
    color: C.text,
    marginBottom: 12,
  },
  body: { fontSize: 16, lineHeight: 24, color: C.muted },
  stack: { gap: 8, marginTop: 26 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: SPACE.card,
    borderRadius: R_INNER,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassEdge,
  },
  rowText: { fontSize: 15, color: C.text, fontWeight: "500" },
  rowMuted: { fontSize: 14, color: C.muted, fontWeight: "400" },
  amount: { fontFamily: MONO, fontSize: 15, color: C.text, fontWeight: "500" },
  chips: { flexDirection: "row", gap: 6 },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: R.pill,
    backgroundColor: C.greenBg,
  },
  chipText: { fontSize: 13, color: C.green, fontWeight: "500" },
  question: {
    alignSelf: "flex-end",
    maxWidth: "88%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: R_INNER,
    borderBottomRightRadius: 4,
    backgroundColor: C.accent,
  },
  questionText: { fontSize: 15, lineHeight: 20, color: "#fff" },
  answerBig: {
    fontFamily: MONO,
    fontSize: 24,
    color: C.text,
    fontWeight: "500",
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 7,
    paddingBottom: 22,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: R.pill,
    backgroundColor: "rgba(122,176,255,0.2)",
  },
  dotActive: { backgroundColor: C.accent, width: 18 },
  footer: { paddingHorizontal: 24, paddingBottom: 12 },
  cta: {
    minHeight: 54,
    paddingVertical: 12,
    borderRadius: R.control,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.accent,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
