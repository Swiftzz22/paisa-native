import { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, R } from "./theme";
import { tapSelection } from "./haptics";
import { CURRENCIES, HOME, type Currency } from "./currency";

/**
 * Pick the currency a receipt was in. Same shape as the category picker, so
 * the two sheets behave identically from the same screen.
 *
 * The last foreign currency used is lifted to just under rupees: whoever is
 * abroad is about to need it again, many times.
 */
export function CurrencyPicker({
  visible,
  selected,
  recent,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: string;
  recent: string | null;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle) {
      return CURRENCIES.filter(
        (c) =>
          c.code.toLowerCase().includes(needle) ||
          c.name.toLowerCase().includes(needle)
      );
    }
    const top = recent ? CURRENCIES.find((c) => c.code === recent) : undefined;
    if (!top || top.code === HOME.code) return CURRENCIES;
    return [HOME, top, ...CURRENCIES.filter((c) => c !== HOME && c !== top)];
  }, [query, recent]);

  function pick(c: Currency) {
    tapSelection();
    onSelect(c.code);
    setQuery("");
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Currency</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Ionicons name="close" size={24} color={C.muted} />
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={C.subtle} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or code"
            placeholderTextColor={C.subtle}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={17} color={C.subtle} />
            </Pressable>
          ) : null}
        </View>

        <FlatList
          data={results}
          keyExtractor={(c) => c.code}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No currency matches that.</Text>
          }
          renderItem={({ item }) => {
            const active = item.code === selected;
            return (
              <Pressable
                onPress={() => pick(item)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.symbol}>{item.symbol}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, active && { color: C.accent }]}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowCode}>{item.code}</Text>
                </View>
                {active ? (
                  <Ionicons name="checkmark" size={19} color={C.accent} />
                ) : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { flex: 1, fontSize: 20, fontWeight: "700", color: C.text },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.card,
    borderRadius: R.control,
    paddingHorizontal: 12,
    minHeight: 44,
    paddingVertical: 8,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  // 16px stops iOS zooming the sheet when the field takes focus.
  searchInput: { flex: 1, color: C.text, fontSize: 16, padding: 0 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  empty: { color: C.subtle, fontSize: 14, textAlign: "center", marginTop: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 56,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  symbol: { width: 44, fontSize: 15, fontWeight: "600", color: C.muted, textAlign: "center" },
  rowLabel: { fontSize: 16, color: C.text },
  rowCode: { fontSize: 12, color: C.subtle, marginTop: 1 },
});
