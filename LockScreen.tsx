import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "./theme";
import { biometricLabel } from "./biometrics";

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [label, setLabel] = useState("Face ID");

  useEffect(() => {
    biometricLabel().then(setLabel);
    // Prompt immediately on mount so opening the app feels seamless.
    onUnlock();
  }, [onUnlock]);

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

        <Pressable style={styles.button} onPress={onUnlock}>
          <Ionicons name="finger-print" size={20} color="#fff" />
          <Text style={styles.buttonText}>Unlock with {label}</Text>
        </Pressable>
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
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  brand: { fontSize: 30, fontWeight: "700", color: C.text },
  subtitle: { fontSize: 14, color: C.muted, marginTop: 6 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 40,
    paddingHorizontal: 22,
    minHeight: 52,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: C.accent,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
