import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, R, R_INNER } from "./theme";
import { tapLight, tapSelection } from "./haptics";
import { SegmentedControl } from "./SegmentedControl";
import { createPerson, PaywallError, type Person, type SplitMode, type SplitPlan } from "./api";
import { money } from "./currency";
import { MODE_LABELS, allocate, itemsToWeights, splitProblem, type ItemAssignment } from "./splitMath";
import type { ReceiptItem } from "./receiptParser";

const ME = "me";
const keyOf = (id: string | null) => id ?? ME;

/**
 * Decide how a bill is shared: who paid, who was in, and how to divide it.
 *
 * Returns a plan rather than saving anything, so it works the same for an
 * expense being added (nothing to attach a split to yet) and one being edited.
 * The amounts shown are a preview in the bill's own currency; the server does
 * the real division when the expense is saved.
 */
export function SplitSheet({
  visible,
  token,
  bill,
  currency,
  people,
  initial,
  receiptItems,
  onPersonAdded,
  onDone,
  onClose,
}: {
  visible: boolean;
  token: string;
  /** The whole bill, in `currency`. */
  bill: number;
  currency: string;
  people: Person[];
  initial: SplitPlan | null;
  /** Line items from a scanned receipt, which make "By item" possible. */
  receiptItems: ReceiptItem[] | null;
  onPersonAdded: (p: Person) => void;
  /** null = no split (it was removed). */
  onDone: (plan: SplitPlan | null) => void;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<(string | null)[]>([null]);
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [mode, setMode] = useState<SplitMode>("equal");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ItemAssignment[]>([]);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Start from the existing split each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setAddError(null);
    setNewName("");
    setItems((receiptItems ?? []).map((it) => ({ name: it.name, amount: it.amount, people: [] })));
    if (initial) {
      setMembers(initial.entries.map((e) => e.personId));
      setPaidBy(initial.paidBy);
      setMode(initial.mode === "items" && !receiptItems?.length ? "exact" : initial.mode);
      setInputs(
        Object.fromEntries(initial.entries.map((e) => [keyOf(e.personId), String(e.weight)]))
      );
    } else {
      setMembers([null]);
      setPaidBy(null);
      setMode("equal");
      setInputs({});
    }
  }, [visible, initial, receiptItems]);

  const modes: SplitMode[] = receiptItems?.length
    ? ["equal", "exact", "percent", "shares", "items"]
    : ["equal", "exact", "percent", "shares"];

  const nameOf = (id: string | null) =>
    id === null ? "You" : people.find((p) => p.id === id)?.name ?? "Someone";

  const plan: SplitPlan = useMemo(() => {
    const num = (k: string, fallback: number) => {
      const v = parseFloat(inputs[k] ?? "");
      return Number.isFinite(v) && v >= 0 ? v : fallback;
    };
    let weights: number[];
    if (mode === "equal") weights = members.map(() => 1);
    else if (mode === "shares") weights = members.map((m) => num(keyOf(m), 1));
    else if (mode === "items") {
      const per = itemsToWeights(members, items, bill);
      weights = members.map((m) => per.get(m) ?? 0);
    } else weights = members.map((m) => num(keyOf(m), 0));
    return {
      paidBy,
      mode,
      entries: members.map((m, i) => ({ personId: m, weight: weights[i] })),
    };
  }, [members, paidBy, mode, inputs, items, bill]);

  const preview = allocate(bill, plan.entries.map((e) => e.weight));
  const problem = splitProblem(plan, bill);

  function toggleMember(id: string) {
    tapSelection();
    setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
    if (paidBy === id && members.includes(id)) setPaidBy(null);
  }

  async function addPerson() {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const { person } = await createPerson(token, { name });
      onPersonAdded(person);
      setMembers((m) => [...m, person.id]);
      setNewName("");
    } catch (e) {
      // A refusal already raised the paywall; anything else is worth saying.
      if (!(e instanceof PaywallError)) {
        setAddError(e instanceof Error ? e.message : "Couldn't add them.");
      }
    } finally {
      setAdding(false);
    }
  }

  function toggleItemPerson(index: number, id: string | null) {
    tapSelection();
    setItems((all) =>
      all.map((it, i) => {
        if (i !== index) return it;
        const has = it.people.includes(id);
        return { ...it, people: has ? it.people.filter((p) => p !== id) : [...it.people, id] };
      })
    );
  }

  const available = people.filter((p) => !p.archived);
  const unit = mode === "percent" ? "%" : mode === "shares" ? "×" : currency;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View style={styles.header}>
            <Text style={styles.title}>Split</Text>
            {initial ? (
              <Pressable
                onPress={() => {
                  tapLight();
                  onDone(null);
                }}
                hitSlop={10}
                style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.remove}>Don't split</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={C.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.bill}>{money(bill, currency)} in total</Text>

            <Text style={styles.label}>Split between</Text>
            <View style={styles.chips}>
              <View style={[styles.chip, styles.chipOn]}>
                <Text style={[styles.chipText, styles.chipTextOn]}>You</Text>
              </View>
              {available.map((p) => {
                const on = members.includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => toggleMember(p.id)}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.addRow}>
              <TextInput
                style={styles.addInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="Add someone by name"
                placeholderTextColor={C.subtle}
                returnKeyType="done"
                onSubmitEditing={addPerson}
                autoCapitalize="words"
              />
              <Pressable
                onPress={addPerson}
                disabled={!newName.trim() || adding}
                style={({ pressed }) => [styles.addBtn, (!newName.trim() || adding) && { opacity: 0.4 }, pressed && { opacity: 0.6 }]}
              >
                {adding ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addBtnText}>Add</Text>}
              </Pressable>
            </View>
            {addError ? <Text style={styles.error}>{addError}</Text> : null}

            <Text style={styles.label}>Who paid?</Text>
            <View style={styles.chips}>
              {members.map((m) => {
                const on = paidBy === m;
                return (
                  <Pressable
                    key={keyOf(m)}
                    onPress={() => {
                      tapSelection();
                      setPaidBy(m);
                    }}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{nameOf(m)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>How</Text>
            <SegmentedControl
              items={modes.map((k) => ({ key: k, label: MODE_LABELS[k] }))}
              value={mode}
              onChange={setMode}
            />

            {mode === "items" ? (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.hint}>
                  Tap who had each item. Untouched items are shared by everyone; tax and tip follow what each person had.
                </Text>
                {items.map((it, i) => (
                  <View key={`${it.name}-${i}`} style={styles.item}>
                    <View style={styles.itemHead}>
                      <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
                      <Text style={styles.itemAmt}>{money(it.amount, currency)}</Text>
                    </View>
                    <View style={styles.chips}>
                      {members.map((m) => {
                        const on = it.people.includes(m);
                        return (
                          <Pressable
                            key={keyOf(m)}
                            onPress={() => toggleItemPerson(i, m)}
                            style={[styles.chipSm, on && styles.chipOn]}
                          >
                            <Text style={[styles.chipTextSm, on && styles.chipTextOn]}>{nameOf(m)}</Text>
                          </Pressable>
                        );
                      })}
                      {it.people.length === 0 ? <Text style={styles.everyone}>Everyone</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.rows}>
              {members.map((m, i) => (
                <View key={keyOf(m)} style={styles.row}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {nameOf(m)}
                    {paidBy === m ? <Text style={styles.paid}>  paid</Text> : null}
                  </Text>
                  {mode === "exact" || mode === "percent" || mode === "shares" ? (
                    <View style={styles.inputWrap}>
                      <TextInput
                        style={styles.rowInput}
                        value={inputs[keyOf(m)] ?? ""}
                        onChangeText={(v) => setInputs((x) => ({ ...x, [keyOf(m)]: v }))}
                        keyboardType="decimal-pad"
                        placeholder={mode === "shares" ? "1" : "0"}
                        placeholderTextColor={C.subtle}
                      />
                      <Text style={styles.unit}>{unit}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.rowAmt}>{money(preview[i] ?? 0, currency)}</Text>
                </View>
              ))}
            </View>

            {problem ? <Text style={styles.problem}>{problem}</Text> : null}
          </ScrollView>

          <Pressable
            style={[styles.done, problem !== null && { opacity: 0.4 }]}
            disabled={problem !== null}
            onPress={() => {
              tapLight();
              onDone(plan);
            }}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: "700", color: C.text },
  headerAction: { marginRight: 18 },
  remove: { color: C.red, fontSize: 14, fontWeight: "500" },
  body: { paddingHorizontal: 20, paddingBottom: 24 },
  bill: { color: C.muted, fontSize: 14, marginBottom: 4 },
  label: { color: C.muted, fontSize: 13, marginTop: 20, marginBottom: 10 },
  hint: { color: C.subtle, fontSize: 12, marginBottom: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  chip: { backgroundColor: C.card, borderWidth: 0.5, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 9 },
  chipSm: { backgroundColor: C.card, borderWidth: 0.5, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.muted, fontSize: 13 },
  chipTextSm: { color: C.muted, fontSize: 12 },
  chipTextOn: { color: "#fff", fontWeight: "500" },
  everyone: { color: C.subtle, fontSize: 12, marginLeft: 2 },
  addRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  addInput: { flex: 1, backgroundColor: C.card, borderWidth: 0.5, borderColor: C.border, borderRadius: R_INNER, paddingHorizontal: 14, paddingVertical: 11, color: C.text, fontSize: 16 },
  addBtn: { backgroundColor: C.accent, borderRadius: R_INNER, paddingHorizontal: 16, justifyContent: "center", minWidth: 64, alignItems: "center" },
  addBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  error: { color: C.red, fontSize: 13, marginTop: 8 },
  item: { borderBottomWidth: 0.5, borderBottomColor: C.border, paddingVertical: 10, gap: 8 },
  itemHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  itemName: { flex: 1, color: C.text, fontSize: 15 },
  itemAmt: { color: C.muted, fontSize: 14 },
  rows: { marginTop: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 50, borderBottomWidth: 0.5, borderBottomColor: C.border },
  rowName: { flex: 1, color: C.text, fontSize: 15 },
  paid: { color: C.subtle, fontSize: 12 },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: R_INNER, paddingHorizontal: 10, minWidth: 92 },
  rowInput: { flex: 1, color: C.text, fontSize: 16, paddingVertical: 8, textAlign: "right" },
  unit: { color: C.subtle, fontSize: 12, marginLeft: 4 },
  rowAmt: { color: C.text, fontSize: 15, fontWeight: "600", minWidth: 84, textAlign: "right" },
  problem: { color: C.red, fontSize: 13, marginTop: 14, textAlign: "center" },
  done: { marginHorizontal: 20, marginBottom: 8, minHeight: 52, borderRadius: R_INNER, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  doneText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
