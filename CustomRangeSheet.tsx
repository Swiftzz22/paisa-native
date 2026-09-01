import { useEffect, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "./theme";
import { tapLight, tapSelection } from "./haptics";

export type CustomRange = { from: Date; to: Date };

const SHORTCUTS: { label: string; days: number }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "3 months", days: 90 },
  { label: "6 months", days: 182 },
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function label(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Pick an arbitrary from–to window, with shortcuts for the common spans. */
export function CustomRangeSheet({
  visible,
  initial,
  onApply,
  onClose,
}: {
  visible: boolean;
  initial: CustomRange | null;
  onApply: (r: CustomRange) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState<Date>(
    initial?.from ?? startOfDay(new Date(Date.now() - 29 * 86_400_000))
  );
  const [to, setTo] = useState<Date>(initial?.to ?? endOfDay(new Date()));
  const [editing, setEditing] = useState<"from" | "to" | null>(null);

  useEffect(() => {
    if (!visible) setEditing(null);
  }, [visible]);

  // Swapped rather than refused — the user's intent is obvious either way.
  const swapped = from.getTime() > to.getTime();
  const realFrom = swapped ? startOfDay(to) : startOfDay(from);
  const realTo = swapped ? endOfDay(from) : endOfDay(to);
  const days = Math.round((realTo.getTime() - realFrom.getTime()) / 86_400_000) + 1;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Custom range</Text>
            <Text style={styles.subtitle}>
              {days} {days === 1 ? "day" : "days"}
              {swapped ? " · dates swapped for you" : ""}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Ionicons name="close" size={24} color={C.muted} />
          </Pressable>
        </View>

        <View style={styles.shortcuts}>
          {SHORTCUTS.map((s) => (
            <Pressable
              key={s.label}
              onPress={() => {
                tapSelection();
                setFrom(startOfDay(new Date(Date.now() - (s.days - 1) * 86_400_000)));
                setTo(endOfDay(new Date()));
                setEditing(null);
              }}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.chipLabel}>Last {s.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.fields}>
          <Pressable
            onPress={() => {
              tapSelection();
              setEditing(editing === "from" ? null : "from");
            }}
            style={({ pressed }) => [
              styles.field,
              editing === "from" && styles.fieldActive,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.fieldLabel}>From</Text>
            <Text style={styles.fieldValue}>{label(from)}</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              tapSelection();
              setEditing(editing === "to" ? null : "to");
            }}
            style={({ pressed }) => [
              styles.field,
              editing === "to" && styles.fieldActive,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.fieldLabel}>To</Text>
            <Text style={styles.fieldValue}>{label(to)}</Text>
          </Pressable>
        </View>

        {editing ? (
          <View style={styles.pickerWrap}>
            <DateTimePicker
              value={editing === "from" ? from : to}
              mode="date"
              display="spinner"
              themeVariant="dark"
              maximumDate={new Date()}
              onChange={(_, picked) => {
                if (!picked) return;
                if (editing === "from") setFrom(startOfDay(picked));
                else setTo(endOfDay(picked));
              }}
            />
          </View>
        ) : (
          <Text style={styles.hint}>Tap a date to change it.</Text>
        )}

        <View style={styles.footer}>
          <Pressable
            onPress={() => {
              tapLight();
              onApply({ from: realFrom, to: realTo });
            }}
            style={({ pressed }) => [styles.apply, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.applyLabel}>Show this range</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
  },
  title: { fontSize: 22, fontWeight: "700", color: C.text },
  subtitle: { fontSize: 12, color: C.subtle, marginTop: 2 },
  shortcuts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  chip: {
    backgroundColor: C.card,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipLabel: { fontSize: 12, color: C.muted, fontWeight: "500" },
  fields: { flexDirection: "row", gap: 10, paddingHorizontal: 18 },
  field: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    padding: 12,
  },
  fieldActive: { borderColor: C.accent },
  fieldLabel: { fontSize: 11, color: C.subtle },
  fieldValue: { fontSize: 15, color: C.text, fontWeight: "600", marginTop: 2 },
  pickerWrap: { flex: 1, justifyContent: "center" },
  hint: {
    flex: 1,
    fontSize: 13,
    color: C.subtle,
    textAlign: "center",
    marginTop: 28,
  },
  footer: { padding: 18 },
  apply: {
    backgroundColor: C.accent,
    borderRadius: 14,
    minHeight: 50,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  applyLabel: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
