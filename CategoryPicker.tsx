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
import { C } from "./theme";
import { tapSelection } from "./haptics";

export type CategoryOption = { id: string; label: string; depth: 0 | 1 };

/**
 * Pick a category from a searchable list.
 *
 * These used to be laid out as chips — every category rendered at once, wrapping
 * one to three per row depending on how long its name was. That meant a wall of
 * ragged pills to scroll past, and the ragged edges were most of why the screen
 * looked badly spaced. A uniform list scans in one column and search means you
 * rarely scroll at all.
 */
export function CategoryPicker({
  visible,
  options,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  options: CategoryOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, query]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Category</Text>
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
            placeholder="Search categories"
            placeholderTextColor={C.subtle}
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus
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
          keyExtractor={(o) => o.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No category matches that.</Text>
          }
          renderItem={({ item }) => {
            const active = item.id === selectedId;
            // Sub-categories are indented so "Food › Coffee" reads as living
            // under Food rather than as an unrelated entry.
            const [parent, child] = item.label.split(" › ");
            return (
              <Pressable
                onPress={() => {
                  tapSelection();
                  onSelect(item.id);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  item.depth === 1 && styles.rowNested,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, active && { color: C.accent }]}>
                    {child ?? parent}
                  </Text>
                  {child ? <Text style={styles.rowParent}>{parent}</Text> : null}
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
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
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
    minHeight: 52,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  rowNested: { paddingLeft: 16 },
  rowLabel: { fontSize: 16, color: C.text },
  rowParent: { fontSize: 12, color: C.subtle, marginTop: 1 },
});
