import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, R } from "./theme";
import { API_BASE, clearToken } from "./api";
import * as AppleAuthentication from "expo-apple-authentication";
import { signInWithGoogle } from "./googleSignIn";
import { isAppleSignInAvailable, signInWithApple } from "./appleSignIn";
import { tapLight, notifyError } from "./haptics";

/**
 * Sign-in.
 *
 * This used to ask people to open a website on a computer, generate a token and
 * paste it in — which nobody outside this project would ever have done, and
 * which an App Review reviewer would reject outright.
 */
export function ConnectScreen({ onConnected }: { onConnected: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only offered where iOS actually supports it, so the button never appears
  // as something that cannot work.
  const [appleReady, setAppleReady] = useState(false);

  useEffect(() => {
    let alive = true;
    isAppleSignInAvailable().then((ok) => alive && setAppleReady(ok));
    return () => {
      alive = false;
    };
  }, []);

  async function signInApple() {
    tapLight();
    setBusy(true);
    setError(null);
    const result = await signInWithApple();
    setBusy(false);

    if (result.ok) {
      // A first Apple sign-in always makes a new account — it cannot safely
      // recognise an existing one, because Apple's relay address matches
      // nothing and a shared real address would be an account takeover. Said
      // plainly here, at the one moment it can be acted on: otherwise this is
      // an empty app that looks like lost data, and the way back (sign out,
      // sign in with Google, link in Settings) is not something anyone would
      // guess at.
      if (result.isNew) {
        Alert.alert(
          "New paisa account created",
          "Sign in with Apple couldn't tell whether you already had an account, so it made a new one.\n\nIf you've used paisa before, sign in with Google instead — then Settings › Link your Apple ID makes Apple open that account from now on.",
          [
            { text: "Start fresh", style: "cancel", onPress: onConnected },
            {
              text: "I have an account",
              onPress: async () => {
                // Drop the brand-new session before offering Google, so the
                // next sign-in starts clean rather than layering on top of it.
                await clearToken();
                signIn();
              },
            },
          ]
        );
        return;
      }
      return onConnected();
    }
    if (result.cancelled) return;
    notifyError();
    setError(result.message);
  }

  async function signIn() {
    tapLight();
    setBusy(true);
    setError(null);
    const result = await signInWithGoogle();
    setBusy(false);

    if (result.ok) return onConnected();
    if (result.cancelled) return; // They backed out; nothing to say.
    notifyError();
    setError(result.message);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.body}>
        <View style={styles.logo}>
          <Ionicons name="wallet" size={30} color={C.accent} />
        </View>
        <Text style={styles.brand}>
          paisa<Text style={{ color: C.subtle }}>.</Text>
        </Text>
        <Text style={styles.subtitle}>
          Sign in to pick up where your spending left off.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Apple first and in Apple's own styling. Guideline 4.8 requires an
            equivalent privacy-preserving option wherever a third-party login
            is offered, and it is also the only way an App Review tester can
            sign in at all — they have an Apple ID, not the owner's Google
            account. */}
        {appleReady ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={
              AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            }
            buttonStyle={
              AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            }
            cornerRadius={R.control}
            style={styles.appleButton}
            onPress={busy ? () => {} : signInApple}
          />
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (busy || pressed) && { opacity: 0.85 },
          ]}
          onPress={signIn}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color="#fff" />
              <Text style={styles.buttonText}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.reassure}>
          paisa. only ever reads. It can never move money or send anything.
        </Text>

        <View style={styles.legalRow}>
          <Pressable
            onPress={() => Linking.openURL(`${API_BASE}/privacy`)}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Text style={styles.privacy}>Privacy policy</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable
            onPress={() => Linking.openURL(`${API_BASE}/terms`)}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Text style={styles.privacy}>Terms of use</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, paddingHorizontal: 30, justifyContent: "center" },
  logo: {
    width: 60,
    height: 60,
    borderRadius: R.card,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  brand: { fontSize: 30, fontWeight: "700", color: C.text },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: C.muted,
    marginTop: 8,
    marginBottom: 32,
  },
  error: { color: C.red, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  appleButton: { width: "100%", height: 50, marginBottom: 10 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 54,
    paddingVertical: 12,
    borderRadius: R.control,
    backgroundColor: C.accent,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  reassure: {
    fontSize: 12,
    lineHeight: 17,
    color: C.subtle,
    textAlign: "center",
    marginTop: 20,
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  legalDot: { color: "#6b7280", fontSize: 13 },
  privacy: {
    fontSize: 12,
    color: C.muted,
    textAlign: "center",
    marginTop: 14,
    textDecorationLine: "underline",
  },
});
