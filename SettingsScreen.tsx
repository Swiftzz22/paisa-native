import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { C } from "./theme";
import { API_BASE, type Dashboard } from "./api";
import { biometricLabel, getLockEnabled, isBiometricAvailable, setLockEnabled } from "./biometrics";

const WEB_LINKS: { icon: string; label: string; path: string }[] = [
  { icon: "grid-outline", label: "Categories", path: "/settings/categories" },
  { icon: "wallet-outline", label: "Budgets", path: "/settings/budgets" },
  { icon: "mail-outline", label: "Email connection", path: "/settings/email" },
  { icon: "finger-print-outline", label: "Passkeys", path: "/settings/passkeys" },
];

export function SettingsScreen({
  user,
  onSignOut,
}: {
  user: Dashboard["user"] | null;
  onSignOut: () => void;
}) {
  const [bioAvailable, setBioAvailable] = useState(false);
  const [lockOn, setLockOn] = useState(true);
  const [bioLabel, setBioLabel] = useState("Face ID");

  useEffect(() => {
    (async () => {
      const available = await isBiometricAvailable();
      setBioAvailable(available);
      if (available) {
        setLockOn(await getLockEnabled());
        setBioLabel(await biometricLabel());
      }
    })();
  }, []);

  function toggleLock(on: boolean) {
    setLockOn(on);
    setLockEnabled(on);
  }

  function confirmSignOut() {
    Alert.alert("Sign out?", "You'll need to paste a new token to reconnect.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: onSignOut },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.account}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          {user?.name ? <Text style={styles.name}>{user.name}</Text> : null}
          <Text style={styles.email}>{user?.email ?? "Signed in"}</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Security</Text>
      <View style={[styles.card, styles.securityRow]}>
        <Ionicons
          name="finger-print"
          size={20}
          color={bioAvailable ? C.muted : C.subtle}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, !bioAvailable && { color: C.subtle }]}>
            Require {bioLabel}
          </Text>
          {!bioAvailable ? (
            <Text style={styles.hint}>Set up Face ID or a fingerprint on your phone first</Text>
          ) : (
            <Text style={styles.hint}>Lock the app when you open it or switch back</Text>
          )}
        </View>
        <Switch
          value={bioAvailable && lockOn}
          onValueChange={toggleLock}
          disabled={!bioAvailable}
          trackColor={{ false: C.border, true: C.accent }}
          thumbColor="#fff"
        />
      </View>

      <Text style={styles.sectionLabel}>Manage on the web</Text>
      <View style={styles.card}>
        {WEB_LINKS.map((l, i) => (
          <Pressable
            key={l.path}
            style={[styles.row, i < WEB_LINKS.length - 1 && styles.rowBorder]}
            onPress={() => Linking.openURL(`${API_BASE}${l.path}`)}
          >
            <Ionicons name={l.icon as never} size={20} color={C.muted} />
            <Text style={styles.rowLabel}>{l.label}</Text>
            <Ionicons name="open-outline" size={16} color={C.subtle} />
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.signOut} onPress={confirmSignOut}>
        <Ionicons name="log-out-outline" size={20} color={C.red} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Text style={styles.footer}>paisa · connected to {API_BASE.replace("https://", "")}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 18, paddingBottom: 24 },
  header: { paddingVertical: 10 },
  title: { fontSize: 24, fontWeight: "700", color: C.text },
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 16,
    padding: 16,
    marginTop: 6,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "600" },
  name: { color: C.text, fontSize: 16, fontWeight: "600" },
  email: { color: C.muted, fontSize: 13, marginTop: 2 },
  sectionLabel: {
    color: C.subtle,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 22,
    marginBottom: 10,
  },
  card: {
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 16,
    overflow: "hidden",
  },
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  hint: { color: C.subtle, fontSize: 12, marginTop: 3 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: C.border },
  rowLabel: { flex: 1, color: C.text, fontSize: 15 },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  signOutText: { color: C.red, fontSize: 15, fontWeight: "500" },
  footer: { color: C.subtle, fontSize: 11, textAlign: "center", marginTop: 20 },
});
