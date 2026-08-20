import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "./theme";
import { API_BASE, fetchDashboard, saveToken } from "./api";

/** Paste-token onboarding. Verifies the token against the server before saving. */
export function ConnectScreen({ onConnected }: { onConnected: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    const token = value.trim();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await fetchDashboard(token); // validate before persisting
      await saveToken(token);
      onConnected();
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes("invalid")
          ? "That token didn't work. Generate a fresh one and paste it again."
          : "Couldn't reach paisa. Check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.body}>
          <View style={styles.logo}>
            <Ionicons name="wallet" size={30} color={C.accent} />
          </View>
          <Text style={styles.brand}>
            paisa<Text style={{ color: C.subtle }}>.</Text>
          </Text>
          <Text style={styles.subtitle}>Connect this phone to your account.</Text>

          <View style={styles.steps}>
            <Step n="1" text={`Open ${API_BASE.replace("https://", "")}/settings/mobile on your computer`} />
            <Step n="2" text="Tap Generate token and copy it" />
            <Step n="3" text="Paste it below" />
          </View>

          <TextInput
            style={styles.input}
            placeholder="pmt_…"
            placeholderTextColor={C.subtle}
            value={value}
            onChangeText={setValue}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            multiline
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.button, (!value.trim() || busy) && styles.buttonDisabled]}
            onPress={connect}
            disabled={!value.trim() || busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Connect</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, paddingHorizontal: 26, justifyContent: "center" },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  brand: { fontSize: 30, fontWeight: "700", color: C.text },
  subtitle: { fontSize: 15, color: C.muted, marginTop: 6 },
  steps: { marginTop: 28, gap: 14 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: C.muted, fontSize: 12, fontWeight: "600" },
  stepText: { flex: 1, color: C.muted, fontSize: 13, lineHeight: 18 },
  input: {
    marginTop: 26,
    minHeight: 52,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.text,
    fontSize: 14,
  },
  error: { color: "#f87171", fontSize: 13, marginTop: 12 },
  button: {
    marginTop: 18,
    height: 52,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
