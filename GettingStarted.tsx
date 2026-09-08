import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { C, R, R_INNER, SPACE } from "./theme";
import { tapLight } from "./haptics";

/**
 * What Home shows before any transaction exists.
 *
 * A screen of zeros gives a new user no way to tell whether the app is working,
 * still looking, or set up wrong. This says which, and gives them the two
 * things they can actually do about it.
 */
export function GettingStarted({
  emailConnected,
  onAdd,
  onConnect,
  connecting,
  onImport,
  importing,
  categoriesReady = true,
}: {
  emailConnected: boolean;
  onAdd: () => void;
  onConnect: () => void;
  connecting: boolean;
  onImport: () => void;
  importing: boolean;
  /** Categories are seeded at first sign-in; false only if that hasn't run. */
  categoriesReady?: boolean;
}) {
  // Setup shown as progress rather than a blank slate. The account and the
  // categories really are done, so ticking them is honest — and starting part
  // of the way along rather than at zero measurably changes whether people
  // finish. The steps are status only; the single action is below them.
  const steps = [
    { done: true, label: "Account created" },
    { done: categoriesReady, label: "Categories ready" },
    { done: false, label: "Get your transactions in" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <View style={styles.card}>
      <View style={styles.badge}>
        <Ionicons name="sparkles-outline" size={22} color={C.accent} />
      </View>

      <Text style={styles.title}>
        {emailConnected ? "Looking through your inbox" : "One step to go"}
      </Text>
      <Text style={styles.body}>
        {emailConnected
          ? "paisa. is reading your bank and UPI emails now. Transactions appear here on their own — pull down to check again. The first sweep can take a few minutes."
          : "Connect the email your bank writes to, and paisa. will turn every alert into a transaction automatically. Until then you can still add spending by hand."}
      </Text>

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${(doneCount / steps.length) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {doneCount} of {steps.length} done
        </Text>
      </View>

      <View style={styles.steps}>
        {steps.map((st) => (
          <View key={st.label} style={styles.stepRow}>
            <Ionicons
              name={st.done ? "checkmark-circle" : "ellipse-outline"}
              size={15}
              color={st.done ? C.green : C.subtle}
            />
            <Text style={[styles.stepText, st.done && styles.stepDone]}>
              {st.label}
            </Text>
          </View>
        ))}
      </View>

      {!emailConnected ? (
        <Pressable
          onPress={onConnect}
          disabled={connecting}
          style={({ pressed }) => [
            styles.primary,
            (pressed || connecting) && { opacity: 0.85 },
          ]}
        >
          {connecting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="mail-outline" size={17} color="#fff" />
              <Text style={styles.primaryText}>Connect email</Text>
            </>
          )}
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => {
          tapLight();
          onImport();
        }}
        disabled={importing}
        style={({ pressed }) => [
          styles.secondary,
          (pressed || importing) && { opacity: 0.7 },
        ]}
      >
        {importing ? (
          <ActivityIndicator color={C.text} />
        ) : (
          <>
            <Ionicons name="document-text-outline" size={17} color={C.text} />
            <Text style={styles.secondaryText}>Upload a statement</Text>
          </>
        )}
      </Pressable>

      {/* Demoted from a third identical button to a text link. Hick's law is
          about options weighed at one decision point, and three buttons of the
          same weight is three; a hierarchy of primary, secondary and link is
          one recommendation with escape hatches. Typing transactions by hand
          is also the rarest of the three, so it earns the least weight. */}
      <Pressable
        onPress={() => {
          tapLight();
          onAdd();
        }}
        hitSlop={8}
        style={({ pressed }) => [styles.tertiary, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.tertiaryText}>or add one by hand</Text>
      </Pressable>

      <Text style={styles.footnote}>
        paisa. only reads. It can never move money or send anything.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: R.card,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: SPACE.card,
    marginTop: 10,
  },
  // One card-padding in from the card's top-left, so the two corners nest.
  badge: {
    width: 46,
    height: 46,
    borderRadius: R_INNER,
    backgroundColor: C.accent + "1f",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: "700", color: C.text, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, color: C.muted },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    paddingVertical: 11,
    borderRadius: R_INNER,
    backgroundColor: C.accent,
    marginTop: 20,
  },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    paddingVertical: 11,
    borderRadius: R_INNER,
    backgroundColor: C.bg,
    marginTop: 10,
  },
  secondaryText: { color: C.text, fontSize: 15, fontWeight: "500" },
  progressWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    marginBottom: 10,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: R.pill,
    backgroundColor: C.border,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: R.pill, backgroundColor: C.text },
  progressText: { color: C.subtle, fontSize: 11 },
  steps: { gap: 6, marginBottom: 14 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepText: { color: C.text, fontSize: 13 },
  stepDone: { color: C.subtle, textDecorationLine: "line-through" },
  tertiary: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  tertiaryText: {
    color: C.subtle,
    fontSize: 13,
    textDecorationLine: "underline",
  },
  footnote: {
    fontSize: 12,
    lineHeight: 17,
    color: C.subtle,
    textAlign: "center",
    marginTop: 16,
  },
});
