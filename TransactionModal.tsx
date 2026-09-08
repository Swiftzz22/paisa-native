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
import { C, R, R_INNER, R_THUMB, SPACE } from "./theme";
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
import { CategoryPicker } from "./CategoryPicker";

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
  const [pickerOpen, setPickerOpen] = useState(false);

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
  const categoryLabel =
    meta?.categories.find((c) => c.id === categoryId)?.label ?? null;
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
              {/* Delete used to sit below Save, past every category chip — a
                  full scroll away from the row you had just tapped. */}
              {editing ? (
                <Pressable
                  onPress={confirmDelete}
                  disabled={busy}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.headerAction,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color={C.red} />
                  ) : (
                    <Ionicons name="trash-outline" size={21} color={C.red} />
                  )}
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={24} color={C.muted} />
              </Pressable>
            </View>

            {!meta ? (
              <View style={styles.loading}>
                <ActivityIndicator color={C.accent} />
              </View>
            ) : (
              <ScrollView
                style={styles.body}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
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
                <Pressable
                  onPress={() => setPickerOpen(true)}
                  style={({ pressed }) => [
                    styles.select,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={[
                      styles.selectValue,
                      !categoryLabel && { color: C.subtle },
                    ]}
                    numberOfLines={1}
                  >
                    {categoryLabel ?? "Choose a category"}
                  </Text>
                  <Ionicons name="chevron-forward" size={17} color={C.subtle} />
                </Pressable>

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

                <View style={{ height: 8 }} />
              </ScrollView>
            )}

            {/* Pinned, so saving never depends on how far you have scrolled. */}
            {meta ? (
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
            ) : null}

            {meta ? (
              <CategoryPicker
                visible={pickerOpen}
                options={meta.categories}
                selectedId={categoryId}
                onSelect={setCategoryId}
                onClose={() => setPickerOpen(false)}
              />
            ) : null}
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
    borderTopLeftRadius: R.card,
    borderTopRightRadius: R.card,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingHorizontal: SPACE.card,
    paddingTop: 8,
    paddingBottom: 20,
  },
  grab: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: R.pill,
    backgroundColor: C.border,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: { flex: 1, fontSize: 20, fontWeight: "700", color: C.text },
  headerAction: { marginRight: 18 },
  select: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.card,
    borderRadius: R_INNER,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  selectValue: { flex: 1, fontSize: 16, color: C.text },
  loading: { paddingVertical: 60, alignItems: "center" },
  // Lets the scrolling area give way so the pinned Save button always fits,
  // whatever the screen height.
  body: { flexShrink: 1 },
  typeToggle: {
    flexDirection: "row",
    gap: 5,
    backgroundColor: C.card,
    borderRadius: R.control,
    padding: SPACE.track,
    marginBottom: 20,
  },
  // The thumb sits one track-padding inside the track. It was 9 against a
  // track of 12 with 4 of padding — one short, which shows up as a corner
  // that does not quite follow the one behind it.
  typeBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: R_THUMB },
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
    borderRadius: R_INNER,
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
    borderRadius: R.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.muted, fontSize: 13 },
  chipTextActive: { color: "#fff", fontWeight: "500" },
  error: { color: C.red, fontSize: 13, marginTop: 16 },
  save: {
    marginTop: 12,
    minHeight: 52,
    paddingVertical: 12,
    borderRadius: R_INNER,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
