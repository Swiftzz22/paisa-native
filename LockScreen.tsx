import { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, R } from "./theme";
import { biometricLabel, setLockEnabled, type AuthOutcome } from "./biometrics";

/**
 * Wait until iOS considers the app active.
 *
 * Face ID is presented by the system on top of the app's window, and asking for
 * it while the app is still launching gets cancelled outright — which arrived
 * here as a prompt that flashed and vanished, indistinguishable from a face the
 * sensor didn't recognise.
 */
function whenActive(run: () => void): () => void {
  if (AppState.currentState === "active") {
    run();
    return () => {};
  }
  const sub = AppState.addEventListener("change", (next) => {
    if (next === "active") {
      sub.remove();
      run();
    }
  });
  return () => sub.remove();
}

export function LockScreen({
  onUnlock,
  onSkipLock,
}: {
  onUnlock: () => Promise<AuthOutcome>;
  onSkipLock: () => void;
}) {
  const [label, setLabel] = useState("Face ID");
  const [outcome, setOutcome] = useState<AuthOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const attempt = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      setOutcome(await onUnlock());
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [onUnlock]);

  useEffect(() => {
    biometricLabel().then(setLabel);
    // Prompt as soon as the app is genuinely on screen, so opening it feels
    // seamless without racing the launch.
    return whenActive(() => {
      void attempt();
    });
  }, [attempt]);

  // Cancelling is a choice, not an error — the button is answer enough.
  const problem =
    outcome && outcome.status !== "ok" && outcome.status !== "cancelled"
      ? outcome.reason
      : null;
  const stuck = outcome?.status === "unavailable";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.body}>
        <View style={styles.logo}>
          <Ionicons name="lock-closed" size={30} color={C.accent} />
        </View>
        <Text style={styles.brand}>
          paisa<Text style={{ color: C.subtle }}>.</Text>
        </Text>
        <Text style={styles.subtitle}>Locked for your privacy</Text>

        {problem ? <Text style={styles.problem}>{problem}</Text> : null}

        <Pressable style={styles.button} onPress={attempt} disabled={busy}>
          <Ionicons name="finger-print" size={20} color="#fff" />
          <Text style={styles.buttonText}>
            {busy ? "Waiting…" : `Unlock with ${label}`}
          </Text>
        </Pressable>

        {/* Face ID that iOS refuses to run would otherwise shut the account
            holder out of their own app for good. The lock is a convenience on
            top of a signed-in session, never the thing keeping the data safe,
            so turning it off is a fair way out — and Settings can put it back. */}
        {stuck ? (
          <Pressable
            style={styles.secondary}
            onPress={() => {
              void setLockEnabled(false).finally(onSkipLock);
            }}
          >
            <Text style={styles.secondaryText}>Turn the lock off and continue</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: R.card,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  brand: { fontSize: 30, fontWeight: "700", color: C.text },
  subtitle: { fontSize: 14, color: C.muted, marginTop: 6 },
  problem: {
    fontSize: 13,
    lineHeight: 19,
    color: C.muted,
    textAlign: "center",
    marginTop: 22,
    maxWidth: 300,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 30,
    paddingHorizontal: 22,
    minHeight: 52,
    paddingVertical: 12,
    borderRadius: R.control,
    backgroundColor: C.accent,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondary: {
    marginTop: 14,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryText: { color: C.muted, fontSize: 14, fontWeight: "500" },
});
