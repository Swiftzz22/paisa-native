import { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
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
import { C, MONO, R, R_INNER, R_THUMB, SPACE, concentric } from "./theme";
import { inr } from "./format";
import {
  AuthError,
  createTransaction,
  fetchMeta,
  updateTransaction,
  type Meta,
  type NewTxn,
  type Txn,
} from "./api";
import { notifySuccess, notifyError, tapLight } from "./haptics";
import { CategoryPicker } from "./CategoryPicker";
import { occurredAtFor, parseQuickAdd, type QuickParse } from "./quickAdd";

type Form = {
  amount: string;
  merchant: string;
  categoryId: string | null;
  paymentMode: string | null;
  day: QuickParse["day"];
  note: string;
};

/** Add a new transaction, or edit/delete an existing one when `editing` is set. */
export function TransactionModal({
  visible,
  token,
  editing,
  history = [],
  onClose,
  onSaved,
  onDelete,
  onNeedAuth,
}: {
  visible: boolean;
  token: string;
  editing: Txn | null;
  /** Their recent transactions, so quick add can file a merchant where they did last time. */
  history?: Txn[];
  onClose: () => void;
  onSaved: () => void;
  /** Hands the row to the undo toast; nothing is sent until that runs out. */
  onDelete: (t: Txn) => void;
  onNeedAuth: () => void;
}) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [type, setType] = useState<"debit" | "credit">("debit");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<string | null>(null);
  const [day, setDay] = useState<QuickParse["day"]>(null);
  const [note, setNote] = useState("");
  const [quick, setQuick] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const amountRef = useRef<TextInput>(null);
  const merchantRef = useRef<TextInput>(null);

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
    setDay(null);
    setNote("");
    setQuick("");
    if (editing) {
      setType(editing.type);
      setAmount(String(editing.amount));
      setMerchant(editing.merchant);
      setCategoryId(editing.categoryId ?? null);
      setPaymentMode(editing.paymentMode);
      setNote(editing.note ?? "");
    } else {
      setType("debit");
      setAmount("");
      setMerchant("");
      setCategoryId(null);
      setPaymentMode(meta?.paymentModes[0]?.value ?? null);
    }
  }, [visible, editing, meta]);

  const current: Form = { amount, merchant, categoryId, paymentMode, day, note };
  const valid = isComplete(current);
  const labelOf = (id: string | null) =>
    meta?.categories.find((c) => c.id === id)?.label ?? null;
  const categoryLabel = labelOf(categoryId);
  const busy = saving;

  const parsed = useMemo(
    () =>
      meta && quick.trim()
        ? parseQuickAdd(quick, {
            modes: meta.paymentModes,
            categories: meta.categories,
            history,
          })
        : null,
    [quick, meta, history]
  );

  /** The quick-add result laid over the form; a part it lacks keeps the form's value. */
  function merged(p: QuickParse): Form {
    return {
      amount: p.amount != null ? String(p.amount) : amount,
      merchant: p.merchant ?? merchant,
      categoryId: p.categoryId ?? categoryId,
      paymentMode: p.paymentMode ?? paymentMode,
      day: p.day ?? day,
      note: p.withName ? `with ${p.withName}` : note,
    };
  }

  function fill(f: Form) {
    setAmount(f.amount);
    setMerchant(f.merchant);
    setCategoryId(f.categoryId);
    setPaymentMode(f.paymentMode);
    setDay(f.day);
    setNote(f.note);
  }

  /** Copy into the form and save, or stop at the first part still missing. */
  function quickAdd() {
    if (!parsed) return;
    tapLight();
    const f = merged(parsed);
    fill(f);
    setQuick("");
    if (isComplete(f)) return save(f);
    if (!(parseFloat(f.amount) > 0)) amountRef.current?.focus();
    else if (!f.merchant.trim()) merchantRef.current?.focus();
    else if (!f.categoryId) setPickerOpen(true);
  }

  async function save(f: Form = current) {
    if (!isComplete(f) || busy) return;
    setSaving(true);
    setError(null);
    const body: NewTxn = {
      amount: parseFloat(f.amount),
      merchant: f.merchant.trim(),
      categoryId: f.categoryId!,
      paymentMode: f.paymentMode!,
      type,
      ...(f.note.trim() ? { note: f.note.trim() } : {}),
      ...(!editing && occurredAtFor(f.day) ? { occurredAt: occurredAtFor(f.day) } : {}),
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
                  // No "Are you sure?": the row goes at once and the toast
                  // offers Undo, which is the quicker way to be safe.
                  onPress={() => onDelete(editing)}
                  disabled={busy}
                  hitSlop={10}
                  accessibilityLabel="Delete transaction"
                  style={({ pressed }) => [
                    styles.headerAction,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Ionicons name="trash-outline" size={21} color={C.red} />
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
                {!editing ? (
                  <View style={styles.quick}>
                    <View style={styles.quickRow}>
                      <Ionicons name="flash-outline" size={16} color={C.highlight} />
                      <TextInput
                        style={styles.quickInput}
                        placeholder="412 zomato upi"
                        placeholderTextColor={C.subtle}
                        value={quick}
                        onChangeText={setQuick}
                        onSubmitEditing={quickAdd}
                        returnKeyType="done"
                        autoCorrect={false}
                        autoCapitalize="none"
                        accessibilityLabel="Quick add"
                      />
                      <Pressable
                        onPress={quickAdd}
                        disabled={!parsed || busy}
                        style={({ pressed }) => [
                          styles.quickAdd,
                          (!parsed || busy) && { opacity: 0.4 },
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <Text style={styles.quickAddText}>Add</Text>
                      </Pressable>
                    </View>
                    {parsed ? (
                      <View style={styles.parts}>
                        <Part
                          value={parsed.amount != null ? inr(parsed.amount) : null}
                          missing="Amount"
                          mono
                          onMissing={() => {
                            fill(merged(parsed));
                            amountRef.current?.focus();
                          }}
                        />
                        <Part
                          value={parsed.merchant}
                          missing="Merchant"
                          onMissing={() => {
                            fill(merged(parsed));
                            merchantRef.current?.focus();
                          }}
                        />
                        <Part
                          value={labelOf(parsed.categoryId)}
                          missing="Category"
                          green
                          onMissing={() => {
                            fill(merged(parsed));
                            setPickerOpen(true);
                          }}
                        />
                        <Part
                          value={
                            meta.paymentModes.find(
                              (m) => m.value === (parsed.paymentMode ?? paymentMode)
                            )?.label ?? null
                          }
                          missing="Payment"
                          onMissing={() => fill(merged(parsed))}
                        />
                        {parsed.day ? <Part value={capitalise(parsed.day)} /> : null}
                        {parsed.withName ? <Part value={`with ${parsed.withName}`} /> : null}
                      </View>
                    ) : null}
                  </View>
                ) : null}

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
                    ref={amountRef}
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
                  ref={merchantRef}
                  style={styles.input}
                  placeholder="e.g. Swiggy"
                  placeholderTextColor={C.subtle}
                  value={merchant}
                  onChangeText={setMerchant}
                />

                {/* What quick add picked up that the form has no field for. */}
                {!editing && (day === "yesterday" || note) ? (
                  <View style={[styles.parts, { marginTop: 10 }]}>
                    {day === "yesterday" ? (
                      <Part value="Yesterday" onClear={() => setDay(null)} />
                    ) : null}
                    {note ? <Part value={note} onClear={() => setNote("")} /> : null}
                  </View>
                ) : null}

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
                onPress={() => save()}
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

function isComplete(f: Form): boolean {
  return parseFloat(f.amount) > 0 && !!f.merchant.trim() && !!f.categoryId && !!f.paymentMode;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * One parsed piece of a quick-add line. A piece that is missing is drawn
 * dashed and takes you to the form field that fills it.
 */
function Part({
  value,
  missing,
  onMissing,
  onClear,
  mono,
  green,
}: {
  value: string | null;
  missing?: string;
  onMissing?: () => void;
  onClear?: () => void;
  mono?: boolean;
  green?: boolean;
}) {
  if (value == null) {
    return (
      <Pressable
        onPress={() => {
          tapLight();
          onMissing?.();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Add ${missing ?? ""}`}
        style={({ pressed }) => [styles.part, styles.partMissing, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="add" size={13} color={C.muted} />
        <Text style={styles.partMissingText}>{missing}</Text>
      </Pressable>
    );
  }
  return (
    <View style={[styles.part, green && styles.partGreen]}>
      <Text
        style={[styles.partText, mono && { fontFamily: MONO }, green && { color: C.green }]}
        numberOfLines={1}
      >
        {value}
      </Text>
      {onClear ? (
        <Pressable onPress={onClear} hitSlop={10} accessibilityLabel={`Remove ${value}`}>
          <Ionicons name="close" size={13} color={C.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  quick: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.glassEdge,
    borderRadius: R_INNER,
    padding: 6,
    paddingLeft: 12,
    marginBottom: 18,
  },
  quickRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  quickInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 8 },
  quickAdd: {
    backgroundColor: C.accent,
    borderRadius: concentric(R_INNER, 6),
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickAddText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  parts: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 8, paddingBottom: 4 },
  part: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.glassEdge,
  },
  partGreen: { backgroundColor: C.greenBg, borderColor: "transparent" },
  partMissing: { backgroundColor: "transparent", borderStyle: "dashed", borderColor: C.subtle },
  partText: { color: C.text, fontSize: 13 },
  partMissingText: { color: C.muted, fontSize: 13 },
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
