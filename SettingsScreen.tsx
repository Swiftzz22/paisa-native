import { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { C, R, R_INNER, SPACE } from "./theme";
import {
  API_BASE,
  deleteAccount,
  deleteAllTransactions,
  deleteImport,
  disconnectEmail,
  fetchImports,
  type Dashboard,
  type ImportSummary,
} from "./api";
import { inr } from "./format";
import { biometricLabel, getLockEnabled, isBiometricAvailable, setLockEnabled } from "./biometrics";
import { notifyError, notifySuccess, tapLight } from "./haptics";
import { pickAndImportStatement } from "./importStatement";
import { isAppleSignInAvailable, linkAppleId } from "./appleSignIn";
import { PlusSheet } from "./PlusSheet";
import { hasAiConsent, requestAiConsent, setAiConsent } from "./aiConsent";
import { isPlusConfigured } from "./plus";

/**
 * What to show where an email address goes.
 *
 * Hide My Email gives us nothing usable, so the account carries a generated
 * `apple_…@appleid.local` placeholder. Printing that as if it were the person's
 * address is worse than saying nothing: it looks like the app has attached them
 * to some stranger's address.
 */
function accountLabel(email: string | undefined): string {
  if (!email) return "Signed in";
  if (email.toLowerCase().endsWith("@appleid.local")) {
    return "Signed in with Apple · email hidden";
  }
  return email;
}

export function SettingsScreen({
  user,
  token,
  onSignOut,
  onImported,
}: {
  user: Dashboard["user"] | null;
  token: string;
  onSignOut: () => void;
  /** Refresh the other screens after an import adds rows. */
  onImported?: () => void;
}) {
  const [bioAvailable, setBioAvailable] = useState(false);
  const [lockOn, setLockOn] = useState(true);
  const [bioLabel, setBioLabel] = useState("Face ID");
  const [deleting, setDeleting] = useState(false);
  const [imports, setImports] = useState<ImportSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const plus = user?.plus === true;
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleLinked, setAppleLinked] = useState(false);
  const [linkingApple, setLinkingApple] = useState(false);
  /** Whether data may be sent to the AI services; read from the device. */
  const [aiOn, setAiOn] = useState(false);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  // Re-read whenever the dashboard reloads the user, which is what happens
  // after an import — the sheet may have been answered on another screen.
  useEffect(() => {
    hasAiConsent().then(setAiOn);
  }, [user]);

  /**
   * Withdrawing has to be real. Statements and Ask go through the phone and
   * simply ask again, but a connected mailbox is read by the server — so
   * turning this off disconnects it, or new alerts would still reach the model.
   */
  async function toggleAi() {
    tapLight();
    if (!(await hasAiConsent())) {
      setAiOn(await requestAiConsent());
      return;
    }
    Alert.alert(
      "Turn off AI processing?",
      "paisa. will ask again before uploading a statement or answering a question. If a mailbox is connected, it will be disconnected so new bank alerts stop being read. Transactions already in paisa. stay.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Turn off",
          style: "destructive",
          onPress: async () => {
            try {
              await disconnectEmail(token);
            } catch {
              notifyError();
              Alert.alert(
                "Couldn't turn it off",
                "Your mailbox couldn't be disconnected just now, so nothing was changed. Please try again."
              );
              return;
            }
            await setAiConsent(false);
            setAiOn(false);
            notifySuccess();
            onImported?.();
          },
        },
      ]
    );
  }

  // Reflect what the server says, so the row does not offer a link to someone
  // who already has one just because this screen was reopened.
  useEffect(() => {
    if (user?.appleLinked) setAppleLinked(true);
  }, [user?.appleLinked]);

  async function linkApple() {
    setLinkingApple(true);
    const res = await linkAppleId(token);
    setLinkingApple(false);
    if (res.ok) {
      setAppleLinked(true);
      notifySuccess();
      Alert.alert(
        "Apple ID linked",
        "Sign in with Apple will now open this account."
      );
      return;
    }
    // Dismissing Apple's sheet is a choice, not something to report back.
    if (res.cancelled) return;
    notifyError();
    Alert.alert("Couldn't link", res.message ?? "Please try again.");
  }

  const loadImports = useCallback(() => {
    fetchImports(token)
      .then(setImports)
      .catch(() => {
        // Not worth an error state: the rest of Settings still works, and the
        // list reappears on the next visit.
      });
  }, [token]);

  useEffect(loadImports, [loadImports]);

  function confirmRemoveImport(b: ImportSummary) {
    Alert.alert(
      `Remove ${b.filename}?`,
      `Deletes the ${b.remaining} transaction${b.remaining === 1 ? "" : "s"} that came from this file. Anything you typed in or that arrived by email stays.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              const r = await deleteImport(token, b.id);
              notifySuccess();
              Alert.alert("Removed", `${r.deleted} transactions deleted.`);
              loadImports();
              onImported?.();
            } catch (e) {
              notifyError();
              Alert.alert(
                "Couldn't remove that import",
                e instanceof Error ? e.message : "Please try again."
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  function confirmClearAll() {
    Alert.alert(
      "Delete all transactions?",
      "Your account, categories, budgets and rules are kept. Emails paisa. already stored will be read again on the next sync.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            // Alert.prompt is iOS-only, same as account deletion above.
            if (Platform.OS !== "ios") {
              Linking.openURL(`${API_BASE}/settings/data`);
              return;
            }
            Alert.prompt(
              "Type DELETE to confirm",
              "This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async (typed?: string) => {
                    setBusy(true);
                    try {
                      const r = await deleteAllTransactions(token, typed ?? "");
                      notifySuccess();
                      Alert.alert(
                        "Deleted",
                        `${r.deleted} transactions removed.`
                      );
                      loadImports();
                      onImported?.();
                    } catch (e) {
                      notifyError();
                      Alert.alert(
                        "Nothing was deleted",
                        e instanceof Error ? e.message : "Please try again."
                      );
                    } finally {
                      setBusy(false);
                    }
                  },
                },
              ],
              "plain-text"
            );
          },
        },
      ]
    );
  }
  const [importing, setImporting] = useState(false);

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
    Alert.alert("Sign out?", "You'll need to sign in again to come back.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: onSignOut },
    ]);
  }

  /**
   * Two deliberate steps: a warning that names what is lost, then typing the
   * account's own email. Deletion is immediate and there is no backup, so a
   * single mis-tap must not be able to reach it.
   */
  function confirmDelete() {
    const email = user?.email;
    if (!email) return;

    // Hide My Email leaves the account with an address this app invented, which
    // nobody has ever seen. Asking for it turns the confirmation into a locked
    // door, so a placeholder account confirms with the word DELETE instead.
    const placeholder = email.toLowerCase().endsWith("@appleid.local");
    const expected = placeholder ? "delete" : email.toLowerCase();

    Alert.alert(
      "Delete your account?",
      "Every transaction, stored bank email and setting is removed permanently. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            // Alert.prompt is iOS-only. Rather than a button that silently does
            // nothing on Android, send them to the same flow on the web.
            if (Platform.OS !== "ios") {
              Linking.openURL(`${API_BASE}/settings/delete-account`);
              return;
            }
            Alert.prompt(
              placeholder ? "Type DELETE to confirm" : "Type your email to confirm",
              placeholder
                ? "This account was created by Sign in with Apple and has no email address of its own."
                : email,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete forever",
                  style: "destructive",
                  onPress: async (typed?: string) => {
                    if ((typed ?? "").trim().toLowerCase() !== expected) {
                      Alert.alert(
                        "That didn't match",
                        placeholder
                          ? "Type DELETE exactly. Nothing was deleted."
                          : "Nothing was deleted."
                      );
                      return;
                    }
                    setDeleting(true);
                    try {
                      await deleteAccount(token, expected);
                      notifySuccess();
                      // The account is gone; drop the local token and return
                      // to the connect screen.
                      onSignOut();
                    } catch (e) {
                      notifyError();
                      Alert.alert(
                        "Couldn't delete the account",
                        e instanceof Error ? e.message : "Please try again."
                      );
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ],
              "plain-text"
            );
          },
        },
      ]
    );
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
          <Text style={styles.email}>{accountLabel(user?.email)}</Text>
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

      {/* Signing in with Apple always creates a fresh account — it cannot
          safely recognise an existing one. Linking from in here is the way the
          two become the same account, and it has to be done while signed in,
          which is what makes the consent real. */}
      {appleAvailable ? (
        <View style={[styles.card, { marginTop: 8 }]}>
          <Pressable
            style={styles.row}
            onPress={linkApple}
            disabled={linkingApple}
          >
            <Ionicons name="logo-apple" size={20} color={C.muted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>
                {linkingApple ? "Linking…" : "Link your Apple ID"}
              </Text>
              <Text style={styles.hint}>
                {appleLinked
                  ? "Linked — Sign in with Apple opens this account"
                  : "So Sign in with Apple brings you here, not to a new account"}
              </Text>
            </View>
            {appleLinked ? (
              <Ionicons name="checkmark-circle" size={20} color={C.green} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={C.subtle} />
            )}
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Add transactions</Text>
      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
          onPress={async () => {
            tapLight();
            setImporting(true);
            const added = await pickAndImportStatement(token, onSignOut);
            setImporting(false);
            if (added) onImported?.();
          }}
          disabled={importing}
        >
          <Ionicons name="document-text-outline" size={20} color={C.muted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Upload a statement</Text>
            <Text style={styles.hint}>
              CSV, Excel or PDF from any bank. Duplicates are skipped.
            </Text>
          </View>
          {importing ? (
            <ActivityIndicator size="small" color={C.muted} />
          ) : (
            <Ionicons name="chevron-forward" size={16} color={C.subtle} />
          )}
        </Pressable>

      </View>

      <Text style={styles.sectionLabel}>Privacy</Text>
      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
          onPress={toggleAi}
        >
          <Ionicons name="sparkles-outline" size={20} color={C.muted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>AI processing</Text>
            <Text style={styles.hint}>
              {aiOn
                ? "On. Statements, bank alerts and Ask are read by Google (Gemini) and NVIDIA."
                : "Off. Tap to see what would be shared, and with whom."}
            </Text>
          </View>
          <Text style={[styles.hint, { color: aiOn ? C.green : C.subtle }]}>
            {aiOn ? "On" : "Off"}
          </Text>
        </Pressable>
      </View>

      {/* The one place someone can find Plus without being refused something
          first. A subscription that can only be discovered by hitting a wall
          is a subscription nobody chooses deliberately. */}
      {/* Hidden until the store is actually wired up. A row that opens a sheet
          saying "Plus isn't available yet" is a dead end, and the reviewer who
          finds it is the one person guaranteed to tap everything. */}
      {isPlusConfigured() ? (
      <>
      <Text style={styles.sectionLabel}>Subscription</Text>
      <View style={styles.card}>
        <Pressable
          style={styles.row}
          onPress={() => {
            tapLight();
            setPlusOpen(true);
          }}
        >
          <Ionicons
            name={plus ? "checkmark-circle" : "sparkles-outline"}
            size={20}
            color={plus ? C.green : C.accent}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>
              {plus ? "paisa. plus is active" : "Get paisa. plus"}
            </Text>
            <Text style={styles.hint}>
              {plus
                ? "Email sync, unlimited imports and Ask"
                : "Automatic email sync, unlimited imports and Ask"}
            </Text>
          </View>
          {plus ? null : (
            <Ionicons name="chevron-forward" size={18} color={C.subtle} />
          )}
        </Pressable>
      </View>
      </>
      ) : null}

      {/* Removing data without removing the account. Deleting the account was
          the only undo available, which is far too blunt an answer to
          "I imported the wrong file". */}
      <Text style={styles.groupTitle}>Your data</Text>
      {imports.length > 0 ? (
        imports.map((b) => (
          <View key={b.id} style={styles.importRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.importName} numberOfLines={1}>
                {b.filename}
              </Text>
              <Text style={styles.importMeta} numberOfLines={1}>
                {b.bank} · {b.remaining} transaction
                {b.remaining === 1 ? "" : "s"}
                {b.spent > 0 ? ` · ${inr(b.spent)} spent` : ""}
              </Text>
            </View>
            <Pressable
              onPress={() => confirmRemoveImport(b)}
              disabled={busy}
              style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.removeBtnText}>Remove</Text>
            </Pressable>
          </View>
        ))
      ) : (
        <Text style={styles.importEmpty}>
          No statements imported yet.
        </Text>
      )}

      <Pressable
        style={({ pressed }) => [styles.clearRow, pressed && { opacity: 0.6 }]}
        onPress={confirmClearAll}
        disabled={busy}
      >
        <Ionicons name="trash-outline" size={17} color={C.red} />
        <Text style={styles.clearText}>Delete all transactions</Text>
      </Pressable>
      <Text style={styles.deleteHint}>
        Clears your transactions but keeps your account, categories, budgets and
        rules. Emails already stored are read again on the next sync.
      </Text>

      <Pressable style={styles.signOut} onPress={confirmSignOut}>
        <Ionicons name="log-out-outline" size={20} color={C.red} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.deleteRow, pressed && { opacity: 0.6 }]}
        onPress={confirmDelete}
        disabled={deleting || !user?.email}
      >
        <Text style={styles.deleteText}>
          {deleting ? "Deleting…" : "Delete account"}
        </Text>
      </Pressable>
      <Text style={styles.deleteHint}>
        Removes every transaction, stored email and setting. Permanent.
      </Text>

      {/* Both documents have to be reachable from inside the app: App Review
          checks for them, and someone deciding whether to trust paisa. with
          their bank email should not have to go hunting on a website. */}
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

      <Text style={styles.footer}>paisa · connected to {API_BASE.replace("https://", "")}</Text>
      <PlusSheet
        visible={plusOpen}
        onClose={() => setPlusOpen(false)}
        onPurchased={() => {
          setPlusOpen(false);
          // The server is the authority and the webhook may still be in
          // flight, so ask it again rather than flipping a local flag.
          onImported?.();
        }}
      />
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
    borderRadius: R.card,
    padding: SPACE.card,
    marginTop: 6,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: R.pill,
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
  // Rows run edge to edge and are clipped to this curve, so there is no inner
  // radius to match here — `overflow: hidden` makes the card's own corner the
  // only one. That is why the card padding had to stay small enough that this
  // radius does not eat into the first row.
  card: {
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: R.card,
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
  rowBorderTop: { borderTopWidth: 0.5, borderTopColor: C.border },
  forwardingAddress: {
    color: C.text,
    fontSize: 13,
    marginTop: 4,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  rowLabel: { flex: 1, color: C.text, fontSize: 15 },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    paddingVertical: 15,
    borderRadius: R.control,
    borderWidth: 0.5,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  signOutText: { color: C.red, fontSize: 15, fontWeight: "500" },
  deleteRow: { alignItems: "center", paddingTop: 22, paddingBottom: 4 },
  deleteText: { color: C.red, fontSize: 14, fontWeight: "500" },
  deleteHint: {
    color: C.subtle,
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: 30,
    lineHeight: 16,
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  legalDot: { color: "#6b7280", fontSize: 13 },
  privacy: {
    color: C.muted,
    fontSize: 12,
    textAlign: "center",
    paddingTop: 20,
    textDecorationLine: "underline",
  },
  groupTitle: {
    color: C.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 26,
    marginBottom: 8,
  },
  importRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.card,
    borderRadius: R.control,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 8,
  },
  importName: { color: C.text, fontSize: 13, fontWeight: "600" },
  importMeta: { color: C.subtle, fontSize: 11, marginTop: 2 },
  importEmpty: {
    color: C.subtle,
    fontSize: 12,
    paddingVertical: 10,
  },
  removeBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.red,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: { color: C.red, fontSize: 12, fontWeight: "600" },
  clearRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: R.control,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 6,
  },
  clearText: { color: C.red, fontSize: 14, fontWeight: "600" },
  footer: { color: C.subtle, fontSize: 11, textAlign: "center", marginTop: 20 },
});
