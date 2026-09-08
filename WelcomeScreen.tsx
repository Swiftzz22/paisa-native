import { useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
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
import { C, R } from "./theme";
import { tapLight, tapSelection } from "./haptics";

type Page = {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  body: string;
};

/**
 * Written in terms of what the person gets, not what the app does internally.
 * Someone opening this for the first time has no idea what "ingestion" or
 * "categorisation" mean, and should not have to.
 */
const PAGES: Page[] = [
  {
    icon: "mail-unread-outline",
    tint: "#3b82f6",
    title: "Stop typing in your spending",
    body:
      "Your bank already emails you every time you tap, swipe or send. paisa. reads those emails and turns them into a running record — so there is nothing to log by hand.",
  },
  {
    icon: "pricetags-outline",
    tint: "#22c55e",
    title: "Sorted before you look",
    body:
      "Every transaction lands in a category on its own — food, transport, subscriptions. Correct one and it remembers, so the same shop is right next time.",
  },
  {
    icon: "chatbubble-ellipses-outline",
    tint: "#a855f7",
    title: "Ask in plain English",
    body:
      "“How much did I spend on food this month?” “What are my top merchants?” You get a straight answer, not a screen of filters to set up.",
  },
  {
    icon: "lock-closed-outline",
    tint: "#f59e0b",
    title: "Yours, and only yours",
    body:
      "paisa. only ever reads — it can never move money or send anything. Your data is separate from every other user's, and you can disconnect or delete it whenever you want.",
  },
];

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
        {PAGES.map((p) => (
          <View key={p.title} style={[styles.page, { width }]}>
            <View style={[styles.badge, { backgroundColor: p.tint + "1f" }]}>
              <Ionicons name={p.icon} size={34} color={p.tint} />
            </View>
            <Text style={styles.title}>{p.title}</Text>
            <Text style={styles.body}>{p.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {PAGES.map((p, i) => (
          <View
            key={p.title}
            style={[styles.dot, i === page && styles.dotActive]}
          />
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
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
    height: 44,
  },
  brand: { fontSize: 20, fontWeight: "700", color: C.text },
  skip: { fontSize: 15, color: C.muted },
  page: { paddingHorizontal: 32, justifyContent: "center", flex: 1 },
  badge: {
    width: 72,
    height: 72,
    borderRadius: R.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 26,
  },
  title: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "700",
    color: C.text,
    marginBottom: 14,
  },
  body: { fontSize: 16, lineHeight: 24, color: C.muted },
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
    backgroundColor: C.border,
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
  },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
