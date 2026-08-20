import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { C } from "./theme";
import { inr } from "./format";
import {
  AuthError,
  createTransaction,
  deleteTransaction,
  fetchMeta,
  updateTransaction,
  type Meta,
  type Txn,
} from "./api";
import { notifySuccess, notifyError } from "./haptics";

/** Add a new transaction, or edit/delete an existing one when `editing` is set. */
export function TransactionModal({
  visible,
  token,
  editing,
  onClose,
  onSaved,
  onNeedAuth,
}: {
  visible: boolean;
  token: string;
  editing: Txn | null;
  onClose: () => void;
  onSaved: () => void;
  onNeedAuth: () => void;
}) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [type, setType] = useState<"debit" | "credit">("debit");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load category / payment-mode options once.
  useEffect(() => {
    if (!visible || meta) return;
    fetchMeta(token)
      .then(setMeta)
      .catch((e) => {
        if (e instanceof AuthError) return onNeedAuth();
        setError("Couldn't load categories.");
      });
  }, [visible, meta, token, onNeedAuth]);

  // Populate the form each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setError(null);
    if (editing) {
      setType(editing.type);
      setAmount(String(editing.amount));
      setMerchant(editing.merchant);
      setCategoryId(editing.categoryId ?? null);
      setPaymentMode(editing.paymentMode);
    } else {
      setType("debit");
      setAmount("");
      setMerchant("");
      setCategoryId(null);
      setPaymentMode(meta?.paymentModes[0]?.value ?? null);
    }
  }, [visible, editing, meta]);

  const amountNum = parseFloat(amount);
  const valid = amountNum > 0 && !!merchant.trim() && !!categoryId && !!paymentMode;
  const busy = saving || deleting;

  async function save() {
    if (!valid || busy) return;
    setSaving(true);
    setError(null);
    const body = {
      amount: amountNum,
      merchant: merchant.trim(),
      categoryId: categoryId!,
      paymentMode: paymentMode!,
      type,
    };
    try {
      if (editing) await updateTransaction(token, editing.id, body);
      else await createTransaction(token, body);
      notifySuccess();
      onSaved();
    } catch (e) {
      if (e instanceof AuthError) return onNeedAuth();
      notifyError();
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!editing || busy) return;
    Alert.alert("Delete transaction?", `${editing.merchant} · ${inr(editing.amount)}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          setError(null);
          try {
            await deleteTransaction(token, editing.id);
            notifySuccess();
            onSaved();
          } catch (e) {
            if (e instanceof AuthError) return onNeedAuth();
            notifyError();
            setError("Couldn't delete. Try again.");
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.grab} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>
                {editing ? "Edit transaction" : "Add transaction"}
              </Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={24} color={C.muted} />
              </Pressable>
            </View>

            {!meta ? (
              <View style={styles.loading}>
                <ActivityIndicator color={C.accent} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.typeToggle}>
                  {(["debit", "credit"] as const).map((t) => (
                    <Pressable
                      key={t}
                      style={[styles.typeBtn, type === t && styles.typeBtnActive]}
                      onPress={() => setType(t)}
                    >
                      <Text style={[styles.typeText, type === t && styles.typeTextActive]}>
                        {t === "debit" ? "Expense" : "Income"}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.amountRow}>
                  <Text style={styles.rupee}>₹</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0"
                    placeholderTextColor={C.subtle}
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={setAmount}
                  />
                </View>

                <Text style={styles.label}>Merchant</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Swiggy"
                  placeholderTextColor={C.subtle}
                  value={merchant}
                  onChangeText={setMerchant}
                />

                <Text style={styles.label}>Category</Text>
                <View style={styles.chips}>
                  {meta.categories.map((c) => (
                    <Pressable
                      key={c.id}
                      style={[styles.chip, categoryId === c.id && styles.chipActive]}
                      onPress={() => setCategoryId(c.id)}
                    >
                      <Text
                        style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}
                      >
                        {c.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Payment mode</Text>
                <View style={styles.chips}>
                  {meta.paymentModes.map((m) => (
                    <Pressable
                      key={m.value}
                      style={[styles.chip, paymentMode === m.value && styles.chipActive]}
                      onPress={() => setPaymentMode(m.value)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          paymentMode === m.value && styles.chipTextActive,
                        ]}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  style={[styles.save, (!valid || busy) && styles.saveDisabled]}
                  onPress={save}
                  disabled={!valid || busy}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveText}>
                      {editing ? "Save changes" : "Save transaction"}
                    </Text>
                  )}
                </Pressable>

                {editing ? (
                  <Pressable
                    style={styles.delete}
                    onPress={confirmDelete}
                    disabled={busy}
                  >
                    {deleting ? (
                      <ActivityIndicator color={C.red} />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={18} color={C.red} />
                        <Text style={styles.deleteText}>Delete transaction</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}

                <View style={{ height: 12 }} />
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheetWrap: { maxHeight: "92%" },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  grab: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "700", color: C.text },
  loading: { paddingVertical: 60, alignItems: "center" },
  typeToggle: {
    flexDirection: "row",
    gap: 5,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  typeBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 9 },
  typeBtnActive: { backgroundColor: C.card2, borderWidth: 0.5, borderColor: C.border },
  typeText: { color: C.muted, fontSize: 14 },
  typeTextActive: { color: C.text, fontWeight: "600" },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 8,
  },
  rupee: { fontSize: 32, color: C.muted, fontWeight: "600" },
  amountInput: {
    fontSize: 44,
    fontWeight: "700",
    color: C.text,
    minWidth: 80,
    textAlign: "center",
    padding: 0,
  },
  label: { color: C.muted, fontSize: 13, marginTop: 18, marginBottom: 10 },
  input: {
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: C.text,
    fontSize: 15,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.muted, fontSize: 13 },
  chipTextActive: { color: "#fff", fontWeight: "500" },
  error: { color: C.red, fontSize: 13, marginTop: 16 },
  save: {
    marginTop: 24,
    height: 52,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  delete: {
    marginTop: 12,
    height: 50,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.border,
    backgroundColor: C.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  deleteText: { color: C.red, fontSize: 15, fontWeight: "500" },
});
