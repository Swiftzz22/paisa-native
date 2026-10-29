import { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, R, R_INNER, SPACE } from "./theme";
import { inr, relativeDate } from "./format";
import { notifyError, notifySuccess, tapLight } from "./haptics";
import {
  AuthError,
  deleteSettlement,
  fetchPeople,
  fetchPerson,
  recordSettlement,
  updatePerson,
  type Person,
  type PersonActivity,
} from "./api";

/**
 * Who owes whom, and squaring up.
 *
 * Everything is from your side: green is money coming to you, red is money
 * you owe. Settlements are recorded here and never count as spending or
 * income — they only move a balance back towards zero.
 *
 * Paying goes through UPI where a UPI ID is known: paisa opens the person's
 * UPI app with the amount filled in and never touches the money itself, then
 * asks whether it went through before recording anything.
 */
export function PeopleScreen({
  visible,
  token,
  onClose,
  onNeedAuth,
}: {
  visible: boolean;
  token: string;
  onClose: () => void;
  onNeedAuth: () => void;
}) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPeople((await fetchPeople(token)).people);
    } catch (e) {
      if (e instanceof AuthError) return onNeedAuth();
      setError("Couldn't load your splits. Pull to try again.");
    } finally {
      setLoading(false);
    }
  }, [token, onNeedAuth]);

  useEffect(() => {
    if (visible) void load();
    else setSelected(null);
  }, [visible, load]);

  const owedToYou = (people ?? []).filter((p) => p.balance > 0).reduce((s, p) => s + p.balance, 0);
  const youOwe = (people ?? []).filter((p) => p.balance < 0).reduce((s, p) => s - p.balance, 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {selected ? (
          <PersonDetail
            token={token}
            personId={selected}
            onBack={() => {
              setSelected(null);
              void load();
            }}
            onNeedAuth={onNeedAuth}
          />
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Splits</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={24} color={C.muted} />
              </Pressable>
            </View>

            <View style={styles.totals}>
              <View style={styles.total}>
                <Text style={styles.totalLabel}>You're owed</Text>
                <Text style={[styles.totalValue, { color: C.green }]}>{inr(owedToYou)}</Text>
              </View>
              <View style={styles.total}>
                <Text style={styles.totalLabel}>You owe</Text>
                <Text style={[styles.totalValue, { color: youOwe > 0 ? C.red : C.text }]}>{inr(youOwe)}</Text>
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <FlatList
              data={people ?? []}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.muted} />}
              ListEmptyComponent={
                people ? (
                  <Text style={styles.empty}>
                    Nobody yet. Open an expense and tap Split to share it with someone.
                  </Text>
                ) : (
                  <ActivityIndicator style={{ marginTop: 40 }} color={C.accent} />
                )
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    tapLight();
                    setSelected(item.id);
                  }}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.sub}>{balanceWords(item.balance)}</Text>
                  </View>
                  <Text style={[styles.amt, { color: tone(item.balance) }]}>
                    {item.balance === 0 ? "—" : inr(item.balance)}
                  </Text>
                  <Ionicons name="chevron-forward" size={17} color={C.subtle} />
                </Pressable>
              )}
            />
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function tone(balance: number): string {
  return balance > 0 ? C.green : balance < 0 ? C.red : C.subtle;
}

function balanceWords(balance: number): string {
  if (balance > 0) return "owes you";
  if (balance < 0) return "you owe";
  return "all square";
}

/** "upi://pay?…" — the standard intent every Indian UPI app answers. */
function upiLink(upiId: string, name: string, amount: number): string {
  const q = [
    `pa=${encodeURIComponent(upiId)}`,
    `pn=${encodeURIComponent(name)}`,
    `am=${amount.toFixed(2)}`,
    "cu=INR",
    `tn=${encodeURIComponent("Settling up via paisa")}`,
  ].join("&");
  return `upi://pay?${q}`;
}

function PersonDetail({
  token,
  personId,
  onBack,
  onNeedAuth,
}: {
  token: string;
  personId: string;
  onBack: () => void;
  onNeedAuth: () => void;
}) {
  const [person, setPerson] = useState<Person | null>(null);
  const [activity, setActivity] = useState<PersonActivity[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetchPerson(token, personId);
      setPerson(r.person);
      setActivity(r.activity);
    } catch (e) {
      if (e instanceof AuthError) return onNeedAuth();
      Alert.alert("Couldn't load this person", "Try again in a moment.");
      onBack();
    }
  }, [token, personId, onNeedAuth, onBack]);

  useEffect(() => {
    void load();
  }, [load]);

  async function settle(direction: "paid" | "received", amount: number, note?: string) {
    setBusy(true);
    try {
      await recordSettlement(token, { personId, amount, direction, note: note ?? null });
      notifySuccess();
      await load();
    } catch (e) {
      if (e instanceof AuthError) return onNeedAuth();
      notifyError();
      Alert.alert("Couldn't record that", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Ask how much, defaulting to the whole balance — part-payments happen. */
  function askAmount(title: string, direction: "paid" | "received") {
    if (!person) return;
    Alert.prompt(
      title,
      "How much? Change it for a part-payment.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Record",
          onPress: (v?: string) => {
            const n = parseFloat(v ?? "");
            if (Number.isFinite(n) && n > 0) void settle(direction, Math.round(n * 100) / 100);
          },
        },
      ],
      "plain-text",
      Math.abs(person.balance).toFixed(2),
      "decimal-pad"
    );
  }

  async function payWithUpi() {
    if (!person?.upiId) return;
    const amount = Math.abs(person.balance);
    try {
      await Linking.openURL(upiLink(person.upiId, person.name, amount));
    } catch {
      Alert.alert(
        "No UPI app opened",
        `Pay ${person.name} (${person.upiId}) in your UPI app, then come back and mark it as paid.`
      );
      return;
    }
    // paisa can't see whether the payment went through, so it asks rather
    // than assuming — a failed UPI payment recorded as paid is worse than none.
    setTimeout(() => {
      Alert.alert(`Did you pay ${person.name} ${inr(amount)}?`, "paisa only records it once you say so.", [
        { text: "Not yet", style: "cancel" },
        { text: "Yes, paid", onPress: () => void settle("paid", amount, "UPI") },
      ]);
    }, 600);
  }

  function editUpi() {
    if (!person) return;
    Alert.prompt(
      "UPI ID",
      `So you can pay ${person.name} in one tap. Looks like name@bank.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: async (v?: string) => {
            try {
              const { person: p } = await updatePerson(token, personId, { upiId: v?.trim() || null });
              setPerson((cur) => (cur ? { ...cur, upiId: p.upiId } : cur));
            } catch (e) {
              if (e instanceof AuthError) return onNeedAuth();
              Alert.alert("Couldn't save that", e instanceof Error ? e.message : "Try again.");
            }
          },
        },
      ],
      "plain-text",
      person.upiId ?? "",
      "email-address"
    );
  }

  function remind() {
    if (!person) return;
    void Share.share({
      message: `Hi ${person.name}, just a reminder: you owe me ${inr(person.balance)} for our shared expenses. Thanks!`,
    });
  }

  function confirmUndo(a: PersonActivity) {
    if (a.kind !== "settlement") return;
    Alert.alert("Remove this payment?", `${a.title} · ${inr(a.total)}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSettlement(token, a.id);
            await load();
          } catch (e) {
            if (e instanceof AuthError) return onNeedAuth();
            Alert.alert("Couldn't remove it", "Try again.");
          }
        },
      },
    ]);
  }

  if (!person) {
    return <ActivityIndicator style={{ marginTop: 60 }} color={C.accent} />;
  }

  return (
    <>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={{ marginRight: 10 }}>
          <Ionicons name="chevron-back" size={24} color={C.muted} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{person.name}</Text>
      </View>

      <View style={styles.hero}>
        <Text style={[styles.heroAmt, { color: tone(person.balance) }]}>
          {person.balance === 0 ? "All square" : inr(person.balance)}
        </Text>
        {person.balance !== 0 ? (
          <Text style={styles.heroSub}>
            {person.balance > 0 ? `${person.name} owes you` : `You owe ${person.name}`}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {person.balance < 0 && person.upiId ? (
          <ActionBtn icon="flash-outline" label="Pay with UPI" primary onPress={payWithUpi} disabled={busy} />
        ) : null}
        {person.balance < 0 ? (
          <ActionBtn icon="cash-outline" label="Mark as paid" onPress={() => askAmount(`You paid ${person.name}`, "paid")} disabled={busy} />
        ) : null}
        {person.balance > 0 ? (
          <ActionBtn icon="checkmark-done-outline" label="They paid me" primary onPress={() => askAmount(`${person.name} paid you`, "received")} disabled={busy} />
        ) : null}
        {person.balance > 0 ? <ActionBtn icon="chatbubble-outline" label="Remind" onPress={remind} /> : null}
      </View>

      <Pressable onPress={editUpi} style={({ pressed }) => [styles.upiRow, pressed && { opacity: 0.6 }]}>
        <Ionicons name="at-outline" size={16} color={C.subtle} />
        <Text style={styles.upiText} numberOfLines={1}>
          {person.upiId ?? "Add their UPI ID to pay in one tap"}
        </Text>
        <Text style={styles.upiEdit}>{person.upiId ? "Edit" : "Add"}</Text>
      </Pressable>

      <FlatList
        data={activity}
        keyExtractor={(a) => `${a.kind}-${a.id}`}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Nothing shared with {person.name} yet.</Text>}
        renderItem={({ item }) => (
          <Pressable
            onLongPress={() => confirmUndo(item)}
            disabled={item.kind !== "settlement"}
            style={styles.actRow}
          >
            <Ionicons
              name={item.kind === "settlement" ? "swap-horizontal-outline" : "receipt-outline"}
              size={18}
              color={C.subtle}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.sub}>
                {relativeDate(item.at, false)}
                {item.kind === "split" ? ` · bill ${inr(item.total)}` : item.note ? ` · ${item.note}` : ""}
              </Text>
            </View>
            <Text style={[styles.amt, { color: tone(item.effect) }]}>
              {item.effect === 0 ? "—" : `${item.effect > 0 ? "+" : "−"}${inr(item.effect)}`}
            </Text>
          </Pressable>
        )}
        ListFooterComponent={
          activity.some((a) => a.kind === "settlement") ? (
            <Text style={styles.footnote}>Press and hold a payment to remove it.</Text>
          ) : null
        }
      />
    </>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  primary,
  disabled,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.action, primary && styles.actionPrimary, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Ionicons name={icon as never} size={17} color={primary ? "#fff" : C.accent} />
      <Text style={[styles.actionText, primary && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: "700", color: C.text },
  totals: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 8 },
  total: { flex: 1, backgroundColor: C.card, borderRadius: R.card, borderWidth: 0.5, borderColor: C.border, padding: SPACE.card },
  totalLabel: { color: C.subtle, fontSize: 12 },
  totalValue: { fontSize: 22, fontWeight: "700", marginTop: 4 },
  error: { color: C.red, fontSize: 13, textAlign: "center", marginVertical: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  empty: { color: C.subtle, fontSize: 14, textAlign: "center", marginTop: 40, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, borderBottomWidth: 0.5, borderBottomColor: C.border },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card2, alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.text, fontSize: 15, fontWeight: "600" },
  name: { color: C.text, fontSize: 15 },
  sub: { color: C.subtle, fontSize: 12, marginTop: 2 },
  amt: { fontSize: 15, fontWeight: "600" },
  hero: { alignItems: "center", paddingVertical: 18 },
  heroAmt: { fontSize: 36, fontWeight: "700" },
  heroSub: { color: C.muted, fontSize: 14, marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, paddingHorizontal: 20 },
  action: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 0.5, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 10 },
  actionPrimary: { backgroundColor: C.accent, borderColor: C.accent },
  actionText: { color: C.accent, fontSize: 14, fontWeight: "600" },
  upiRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginTop: 16, marginBottom: 6, backgroundColor: C.card, borderRadius: R_INNER, paddingHorizontal: 14, minHeight: 46 },
  upiText: { flex: 1, color: C.muted, fontSize: 14 },
  upiEdit: { color: C.accent, fontSize: 14, fontWeight: "500" },
  actRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 58, borderBottomWidth: 0.5, borderBottomColor: C.border },
  footnote: { color: C.subtle, fontSize: 12, textAlign: "center", marginTop: 14 },
});
