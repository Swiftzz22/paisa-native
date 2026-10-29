import { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
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
  PaywallError,
  aiReadReceipt,
  createTransaction,
  fetchFxRate,
  fetchMeta,
  fetchPeople,
  removeSplit,
  saveSplit,
  tzOffsetMinutes,
  updateTransaction,
  type FxQuote,
  type Meta,
  type NewTxn,
  type Person,
  type SplitPlan,
  type Txn,
} from "./api";
import { notifySuccess, notifyError, tapLight } from "./haptics";
import { CategoryPicker } from "./CategoryPicker";
import { occurredAtFor, parseQuickAdd, type QuickParse } from "./quickAdd";
import { CurrencyPicker } from "./CurrencyPicker";
import {
  HOME,
  currencyFor,
  money,
  lastForeignCurrency,
  localDay,
  rememberForeignCurrency,
} from "./currency";
import * as ImagePicker from "expo-image-picker";
import { readReceipt, isSupported as canReadText } from "./modules/receipt-ocr";
import { parseReceipt, THREE_DECIMALS, type ParsedReceipt } from "./receiptParser";
import { showPaywall } from "./paywallBus";
import { requestAiConsent } from "./aiConsent";
import { SplitSheet } from "./SplitSheet";
import { allocate, splitProblem } from "./splitMath";

type Form = {
  amount: string;
  merchant: string;
  categoryId: string | null;
  paymentMode: string | null;
  day: QuickParse["day"];
  note: string;
};

/** A saved split, turned back into the plan the split sheet edits. */
function planFromTxn(t: Txn): SplitPlan | null {
  if (!t.split) return null;
  return {
    paidBy: t.split.paidBy,
    mode: t.split.mode ?? "exact",
    entries: t.split.shares.map((s) => ({ personId: s.personId, weight: s.weight })),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "15 Jun" from "2025-06-15". */
function shortDay(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** ₹67.17 for most currencies; ₹0.611 or ₹0.00532 when one unit is under a rupee. */
function rateLabel(inrPerUnit: number): string {
  return inrPerUnit >= 1 ? `₹${inrPerUnit.toFixed(2)}` : `₹${inrPerUnit.toPrecision(3)}`;
}

/** Add a new transaction, or edit/delete an existing one when `editing` is set. */
export function TransactionModal({
  visible,
  token,
  editing,
  plusAccess,
  history = [],
  onClose,
  onSaved,
  onDelete,
  onNeedAuth,
}: {
  visible: boolean;
  token: string;
  editing: Txn | null;
  /** Whether Plus features are open to this person (scanning runs on-device). */
  plusAccess: boolean;
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
  // What the typed amount is in. Rupees unless someone chooses otherwise.
  const [currency, setCurrency] = useState(HOME.code);
  const [recentCurrency, setRecentCurrency] = useState<string | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [quote, setQuote] = useState<FxQuote | null>(null);
  const [quoteFailed, setQuoteFailed] = useState(false);
  // Receipt scanning.
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  /** YYYY-MM-DD printed on a scanned receipt, when it isn't today. */
  const [receiptDate, setReceiptDate] = useState<string | null>(null);
  /** Kept for splitting a bill by item, which builds on this. */
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  // Bill splitting.
  const [splitPlan, setSplitPlan] = useState<SplitPlan | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  /** What the phone read off the last photo — all the AI fallback ever sees. */
  const [ocrLines, setOcrLines] = useState<string[] | null>(null);
  /** The AI reads amounts itself, so its answer is never re-read by the rules. */
  const [receiptFromAi, setReceiptFromAi] = useState(false);
  const [offerAi, setOfferAi] = useState(false);
  const [aiReading, setAiReading] = useState(false);

  /**
   * When the money went out. A receipt's printed date wins; then "yesterday"
   * from quick add; otherwise now. Undefined means the server's now.
   */
  const occurredAt = receiptDate
    ? // Local noon, on the minute: the server reads that as "date only" and
      // won't print a time the receipt never gave.
      new Date(`${receiptDate}T12:00:00`).toISOString()
    : occurredAtFor(day);
  // The rate belongs to the day the money was spent: the original date when
  // editing, otherwise the day worked out above.
  const spentDay = editing
    ? localDay(new Date(editing.occurredAt))
    : localDay(occurredAt ? new Date(occurredAt) : new Date());
  const foreign = currency !== HOME.code;

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
    setScanNote(null);
    setReceiptDate(null);
    setReceipt(null);
    setOcrLines(null);
    setReceiptFromAi(false);
    setOfferAi(false);
    if (editing) {
      setType(editing.type);
      // A foreign expense is edited in the currency it was paid in.
      // The form edits the whole bill: a split expense's `amount` is only your
      // share, so it opens on the split's total (or the foreign receipt amount).
      setAmount(String(editing.original?.amount ?? editing.split?.total ?? editing.amount));
      setSplitPlan(planFromTxn(editing));
      setCurrency(editing.original?.currency ?? HOME.code);
      setMerchant(editing.merchant);
      setCategoryId(editing.categoryId ?? null);
      setPaymentMode(editing.paymentMode);
      setNote(editing.note ?? "");
    } else {
      setType("debit");
      setAmount("");
      setCurrency(HOME.code);
      setSplitPlan(null);
      setMerchant("");
      setCategoryId(null);
      setPaymentMode(meta?.paymentModes[0]?.value ?? null);
    }
  }, [visible, editing, meta]);

  useEffect(() => {
    if (visible) void lastForeignCurrency().then(setRecentCurrency);
  }, [visible]);

  // People to split with. Quietly empty on failure: the split sheet still
  // lets someone be added by name.
  useEffect(() => {
    if (!visible || !plusAccess) return;
    fetchPeople(token)
      .then((r) => setPeople(r.people))
      .catch(() => {});
  }, [visible, plusAccess, token]);

  // Fetch the rate whenever the currency or the day changes. Typing only
  // multiplies, so it never waits on the network.
  useEffect(() => {
    setQuote(null);
    setQuoteFailed(false);
    if (!visible || !foreign) return;
    let stale = false;
    fetchFxRate(token, currency, spentDay)
      .then((q) => {
        if (!stale) setQuote(q);
      })
      .catch((e) => {
        if (stale) return;
        if (e instanceof AuthError) return onNeedAuth();
        // The paywall sheet is already up; back to rupees underneath it so
        // the form isn't left in a currency it can't save.
        if (e instanceof PaywallError) return setCurrency(HOME.code);
        setQuoteFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [visible, foreign, currency, spentDay, token, onNeedAuth]);

  const amountNum = parseFloat(amount);
  const current: Form = { amount, merchant, categoryId, paymentMode, day, note };
  const valid = isComplete(current);
  const labelOf = (id: string | null) =>
    meta?.categories.find((c) => c.id === id)?.label ?? null;
  const categoryLabel = labelOf(categoryId);
  const busy = saving;

  // "Split 3 ways · your share S$15.00", previewed in the bill's currency.
  const splitSummary = (() => {
    if (!splitPlan || !(amountNum > 0)) return null;
    const shares = allocate(amountNum, splitPlan.entries.map((e) => e.weight));
    const mine = shares[splitPlan.entries.findIndex((e) => e.personId === null)] ?? 0;
    const payer = splitPlan.paidBy
      ? people.find((p) => p.id === splitPlan.paidBy)?.name ?? "someone"
      : null;
    return `Split ${splitPlan.entries.length} ways · your share ${money(mine, currency)}${payer ? ` · ${payer} paid` : ""}`;
  })();

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
    const bill = parseFloat(f.amount);
    // Worked out from the form being saved, not the last render: quick add
    // saves straight after filling it, before "yesterday" has re-rendered.
    const when = receiptDate ? occurredAt : occurredAtFor(f.day);
    const plan = type === "debit" ? splitPlan : null;
    const planProblem = plan ? splitProblem(plan, bill) : null;
    if (planProblem) {
      setError(`The split doesn't add up any more: ${planProblem} Open it to fix.`);
      return;
    }
    setSaving(true);
    setError(null);
    const body: NewTxn = {
      amount: bill,
      merchant: f.merchant.trim(),
      categoryId: f.categoryId!,
      paymentMode: f.paymentMode!,
      type,
      ...(f.note.trim() ? { note: f.note.trim() } : {}),
      ...(!editing && when ? { occurredAt: when } : {}),
    };
    if (foreign) {
      // The server works out the rupees itself from the purchase day's rate;
      // `amount` still has to be present and positive to pass validation.
      body.original = { amount: bill, currency };
      body.tzOffset = tzOffsetMinutes();
    } else if (editing?.original) {
      body.original = null; // switched back to rupees
    }
    let savedId: string;
    try {
      if (editing) {
        await updateTransaction(token, editing.id, body);
        savedId = editing.id;
      } else {
        savedId = (await createTransaction(token, body)).transaction.id;
      }
      if (foreign) void rememberForeignCurrency(currency);
    } catch (e) {
      if (e instanceof AuthError) return onNeedAuth();
      notifyError();
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setSaving(false);
      return;
    }
    // The expense is saved either way; the split is a second step on top. If
    // it fails, say so plainly rather than leave the form open, where saving
    // again would add the expense twice.
    try {
      if (plan) await saveSplit(token, savedId, plan);
      else if (editing?.split) await removeSplit(token, savedId);
      notifySuccess();
      onSaved();
    } catch (e) {
      if (e instanceof AuthError) return onNeedAuth();
      notifyError();
      onSaved();
      Alert.alert(
        "Saved, but not split",
        `${e instanceof Error ? e.message : "The split didn't go through."} Open the expense to split it again.`
      );
    } finally {
      setSaving(false);
    }
  }

  function chooseScanSource() {
    if (!plusAccess) {
      showPaywall("Scanning receipts is part of paisa. plus.");
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ["Take photo", "Choose from Photos", "Cancel"], cancelButtonIndex: 2 },
      (i) => {
        if (i === 0) void scan("camera");
        if (i === 1) void scan("library");
      }
    );
  }

  /**
   * Photo → text on the phone → fields. The photo itself never leaves the
   * device; only what ends up in the form is saved.
   */
  async function scan(source: "camera" | "library") {
    if (!canReadText) {
      setScanNote("This iPhone can't read text from photos.");
      return;
    }
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Camera access is off",
          "Turn it on in Settings › paisa to scan receipts.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Open Settings", onPress: () => void Linking.openSettings() },
          ]
        );
        return;
      }
    }
    // The system Photos picker needs no permission; it only hands over the
    // one picture chosen.
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.9 };
    const picked =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
    if (picked.canceled || !picked.assets[0]) return;

    setScanning(true);
    setScanNote(null);
    setError(null);
    try {
      const lines = await readReceipt(picked.assets[0].uri);
      setOcrLines(lines);
      applyReceipt(parseReceipt(lines, { recentCurrency }));
    } catch {
      notifyError();
      setScanNote("Couldn't read that photo. Try again in better light, or type it in.");
    } finally {
      setScanning(false);
    }
  }

  function applyReceipt(r: ParsedReceipt, fromAi = false) {
    setReceipt(r);
    setReceiptFromAi(fromAi);
    // Offer help only where the rules struggled, and never twice.
    setOfferAi(!fromAi && (r.total === null || r.confidence < 0.5));
    if (r.total !== null) setAmount(String(r.total));
    // The AI's reading of the name beats whatever the rules guessed a moment ago.
    if (r.merchant && (fromAi || !merchant.trim())) setMerchant(r.merchant);
    if (r.currency) setCurrency(r.currency);
    const today = localDay(new Date());
    setReceiptDate(r.date && r.date !== today ? r.date : null);

    // Say what to check, not just that it worked.
    if (r.total === null) {
      notifyError();
      setScanNote(
        fromAi
          ? "Couldn't find a total even with AI. Type the amount in."
          : "Couldn't find a total on that receipt. Type the amount in."
      );
      return;
    }
    notifySuccess();
    if (fromAi) {
      setScanNote("Read with AI. Give it a glance before saving.");
    } else if (r.confidence < 0.5) {
      setScanNote("Read from the receipt, but it was hard to make out. Check the amount.");
    } else if (r.currency && !r.currencySure && r.currency !== HOME.code) {
      setScanNote(`Guessed ${r.currency} from the symbol. Tap it to change.`);
    } else {
      setScanNote("Filled in from the receipt.");
    }
  }

  /**
   * Picking a currency after a scan. A receipt that never printed one was read
   * as two-decimal money, so "0.750" came out as 750; once someone says it was
   * dinars, the same text is read again in fils. Only while the amount is
   * still the scanned one: a total typed in by hand is theirs to keep.
   */
  function pickCurrency(code: string) {
    setCurrency(code);
    if (!receipt || !ocrLines || receiptFromAi) return;
    if (receipt.total === null || amount !== String(receipt.total)) return;
    if (THREE_DECIMALS.has(code) === THREE_DECIMALS.has(receipt.currency ?? "")) return;
    applyReceipt(parseReceipt(ocrLines, { recentCurrency, currency: code }));
  }

  /** Text only, after consent; the photo itself is long gone. */
  async function readWithAi() {
    if (!ocrLines || aiReading) return;
    if (!(await requestAiConsent())) return;
    setAiReading(true);
    try {
      const { receipt } = await aiReadReceipt(token, ocrLines, recentCurrency);
      applyReceipt({ ...receipt, currencySure: receipt.currency !== null, confidence: 1 }, true);
    } catch (e) {
      if (e instanceof AuthError) return onNeedAuth();
      if (e instanceof PaywallError) return;
      notifyError();
      setScanNote(e instanceof Error ? e.message : "Couldn't read it with AI. Type it in.");
    } finally {
      setAiReading(false);
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
              ) : (
                <Pressable
                  onPress={chooseScanSource}
                  disabled={busy || scanning}
                  hitSlop={8}
                  style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.6 }]}
                >
                  {scanning ? (
                    <ActivityIndicator size="small" color={C.accent} />
                  ) : (
                    <Ionicons name="scan-outline" size={16} color={C.accent} />
                  )}
                  <Text style={styles.scanText}>{scanning ? "Reading…" : "Scan receipt"}</Text>
                </Pressable>
              )}
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
                          // In whatever the amount is in, so a quick add during
                          // a trip doesn't claim rupees for a baht amount.
                          value={
                            parsed.amount != null
                              ? foreign
                                ? money(parsed.amount, currency)
                                : inr(parsed.amount)
                              : null
                          }
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
                  {/* The symbol doubles as the currency switch, so changing it
                      happens where the eye already is. */}
                  <Pressable
                    onPress={() => {
                      tapLight();
                      setCurrencyOpen(true);
                    }}
                    hitSlop={10}
                    accessibilityLabel={`Currency: ${currencyFor(currency).name}`}
                    style={({ pressed }) => [styles.currencyBtn, pressed && { opacity: 0.6 }]}
                  >
                    <Text
                      style={[styles.rupee, currencyFor(currency).symbol.length > 2 && styles.rupeeLong]}
                    >
                      {currencyFor(currency).symbol}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={C.subtle} />
                  </Pressable>
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

                {foreign ? (
                  <View style={styles.fxPreview}>
                    {quote ? (
                      <>
                        <Text style={styles.fxInr}>
                          {amountNum > 0 ? `≈ ${inr(amountNum * quote.inrPerUnit)}` : "₹ —"}
                        </Text>
                        <Text style={styles.fxRate}>
                          1 {currency} = {rateLabel(quote.inrPerUnit)} · rate of{" "}
                          {shortDay(quote.rateDate)}
                        </Text>
                      </>
                    ) : quoteFailed ? (
                      <Text style={styles.fxRate}>
                        Couldn't fetch the rate. It's looked up again when you save.
                      </Text>
                    ) : (
                      <ActivityIndicator size="small" color={C.subtle} />
                    )}
                  </View>
                ) : null}

                {scanNote ? <Text style={styles.scanNote}>{scanNote}</Text> : null}
                {offerAi && ocrLines ? (
                  <Pressable
                    onPress={readWithAi}
                    disabled={aiReading}
                    hitSlop={8}
                    style={({ pressed }) => [styles.aiBtn, pressed && { opacity: 0.6 }]}
                  >
                    {aiReading ? (
                      <ActivityIndicator size="small" color={C.accent} />
                    ) : (
                      <Ionicons name="sparkles-outline" size={14} color={C.accent} />
                    )}
                    <Text style={styles.aiBtnText}>
                      {aiReading ? "Reading with AI…" : "Try reading it with AI"}
                    </Text>
                  </Pressable>
                ) : null}
                {receiptDate ? (
                  <View style={styles.dateChip}>
                    <Ionicons name="calendar-outline" size={13} color={C.muted} />
                    <Text style={styles.dateChipText}>
                      Dated {shortDay(receiptDate)}, from the receipt
                    </Text>
                    <Pressable onPress={() => setReceiptDate(null)} hitSlop={10}>
                      <Text style={styles.dateChipUndo}>Use today</Text>
                    </Pressable>
                  </View>
                ) : null}

                <Text style={styles.label}>Merchant</Text>
                <TextInput
                  ref={merchantRef}
                  style={styles.input}
                  placeholder="e.g. Swiggy"
                  placeholderTextColor={C.subtle}
                  value={merchant}
                  onChangeText={setMerchant}
                />

                {/* What quick add picked up that the form has no field for. A
                    receipt's own date, shown above, takes the place of "yesterday". */}
                {!editing && ((day === "yesterday" && !receiptDate) || note) ? (
                  <View style={[styles.parts, { marginTop: 10 }]}>
                    {day === "yesterday" && !receiptDate ? (
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

                {type === "debit" ? (
                  <>
                    <Text style={styles.label}>Split</Text>
                    <Pressable
                      onPress={() => {
                        if (!plusAccess) {
                          showPaywall("Splitting bills is part of paisa. plus.");
                          return;
                        }
                        if (!(amountNum > 0)) {
                          setError("Enter the amount first, then split it.");
                          return;
                        }
                        tapLight();
                        setSplitOpen(true);
                      }}
                      style={({ pressed }) => [styles.select, pressed && { opacity: 0.7 }]}
                    >
                      <Ionicons name="people-outline" size={18} color={splitPlan ? C.accent : C.subtle} />
                      <Text style={[styles.selectValue, !splitPlan && { color: C.subtle }]} numberOfLines={1}>
                        {splitSummary ?? "Split this with others"}
                      </Text>
                      <Ionicons name="chevron-forward" size={17} color={C.subtle} />
                    </Pressable>
                  </>
                ) : null}

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

            <SplitSheet
              visible={splitOpen}
              token={token}
              bill={amountNum > 0 ? amountNum : 0}
              currency={currency}
              people={people}
              initial={splitPlan}
              receiptItems={receipt?.items.length ? receipt.items : null}
              onPersonAdded={(p) => setPeople((all) => [...all, p])}
              onDone={(plan) => {
                setSplitPlan(plan);
                setSplitOpen(false);
              }}
              onClose={() => setSplitOpen(false)}
            />

            <CurrencyPicker
              visible={currencyOpen}
              selected={currency}
              recent={recentCurrency}
              onSelect={pickCurrency}
              onClose={() => setCurrencyOpen(false)}
            />
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
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: R.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 14,
  },
  scanText: { color: C.accent, fontSize: 13, fontWeight: "600" },
  scanNote: { color: C.muted, fontSize: 13, textAlign: "center", marginTop: 6 },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: R.pill,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  aiBtnText: { color: C.accent, fontSize: 13, fontWeight: "600" },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
  },
  dateChipText: { color: C.muted, fontSize: 13 },
  dateChipUndo: { color: C.accent, fontSize: 13, fontWeight: "500" },
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
  currencyBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  rupee: { fontSize: 32, color: C.muted, fontWeight: "600" },
  // "AED", "HK$" — three letters at 32 would push the amount off-centre.
  rupeeLong: { fontSize: 20 },
  fxPreview: { alignItems: "center", minHeight: 40, justifyContent: "center", gap: 2 },
  fxInr: { fontSize: 17, fontWeight: "600", color: C.text },
  fxRate: { fontSize: 12, color: C.subtle, textAlign: "center" },
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
