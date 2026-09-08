import { useCallback, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { C, R } from "./theme";
import { inr, relativeDate, categoryIcon, categoryColor } from "./format";
import { type Txn } from "./api";
import { tapSelection } from "./haptics";

type Filter = "all" | "debit" | "credit";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "debit", label: "Spent" },
  { key: "credit", label: "Received" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Match a transaction against a free-text query. Digits are also compared
 * against the amount, so typing "465" finds a ₹465 charge directly — usually
 * the quickest way to pin down one specific transaction.
 */
function matches(t: Txn, needle: string): boolean {
  const digits = needle.replace(/[^0-9]/g, "");
  if (digits.length > 0 && String(Math.round(t.amount)).includes(digits)) {
    return true;
  }
  return (
    t.merchant.toLowerCase().includes(needle) ||
    t.category.toLowerCase().includes(needle) ||
    t.paymentMode.toLowerCase().includes(needle) ||
    (t.note ?? "").toLowerCase().includes(needle)
  );
}

export function TransactionsScreen({
  items,
  loading,
  loadingMore,
  error,
  onRefresh,
  onLoadMore,
  onEdit,
}: {
  items: Txn[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onLoadMore: () => void;
  onEdit?: (t: Txn) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }, [onRefresh]);

  // Filtering and grouping run over what's already in memory, so results appear
  // between keystrokes rather than after a request.
  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((t) => {
      if (filter !== "all" && t.type !== filter) return false;
      return needle.length === 0 || matches(t, needle);
    });

    const groups: { title: string; total: number; data: Txn[] }[] = [];
    let current: (typeof groups)[number] | null = null;
    let currentKey = "";
    for (const t of filtered) {
      const d = new Date(t.occurredAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key !== currentKey) {
        currentKey = key;
        current = {
          title: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
          total: 0,
          data: [],
        };
        groups.push(current);
      }
      current!.data.push(t);
      current!.total += t.type === "credit" ? -t.amount : t.amount;
    }
    return groups;
  }, [items, query, filter]);

  const resultCount = useMemo(
    () => sections.reduce((n, s) => n + s.data.length, 0),
    [sections]
  );
  const searching = query.trim().length > 0 || filter !== "all";

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={C.subtle} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Merchant, category, or amount"
            placeholderTextColor={C.subtle}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="never"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => {
                setQuery("");
                Keyboard.dismiss();
              }}
              hitSlop={10}
            >
              <Ionicons name="close-circle" size={17} color={C.subtle} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.chipRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  if (!active) tapSelection();
                  setFilter(f.key);
                }}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
          {searching ? (
            <Text style={styles.resultCount}>
              {resultCount} {resultCount === 1 ? "result" : "results"}
            </Text>
          ) : null}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {searching
              ? "No transactions match that."
              : "Nothing here yet. Tap + to add your first transaction."}
          </Text>
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={C.subtle} style={{ marginVertical: 16 }} />
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionTotal}>
              {section.total < 0 ? "+" : ""}
              {inr(Math.abs(section.total))}
            </Text>
          </View>
        )}
        renderItem={({ item: t }) => {
          const credit = t.type === "credit";
          const tint = credit ? C.green : categoryColor(t.category);
          return (
            <Pressable
              onPress={() => onEdit?.(t)}
              style={({ pressed }) => [styles.txn, pressed && { opacity: 0.6 }]}
            >
              <View style={[styles.txnIcon, { backgroundColor: tint + "26" }]}>
                <Ionicons
                  name={(credit ? "arrow-down" : categoryIcon(t.category)) as never}
                  size={18}
                  color={tint}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txnMerchant} numberOfLines={1}>
                  {t.merchant}
                </Text>
                <Text style={styles.txnSub} numberOfLines={1}>
                  {t.category} · {relativeDate(t.occurredAt, t.timeKnown)} · {t.paymentMode}
                </Text>
              </View>
              <Text style={[styles.txnAmt, credit && { color: C.green }]}>
                {credit ? "+" : "−"}
                {inr(t.amount)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 18, paddingBottom: 24 },
  header: { paddingHorizontal: 18, paddingTop: 10 },
  title: { fontSize: 24, fontWeight: "700", color: C.text },
  error: { color: C.red, fontSize: 13, marginTop: 6 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.card,
    borderRadius: R.control,
    paddingHorizontal: 12,
    minHeight: 40,
    paddingVertical: 8,
    marginTop: 12,
  },
  // 16px keeps iOS from zooming the view when the field takes focus.
  searchInput: { flex: 1, color: C.text, fontSize: 16, padding: 0 },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: C.card,
  },
  chipActive: { backgroundColor: C.accent },
  chipLabel: { fontSize: 12, color: C.muted, fontWeight: "500" },
  chipLabelActive: { color: "#fff" },
  resultCount: { fontSize: 12, color: C.subtle, marginLeft: "auto" },
  empty: { color: C.subtle, fontSize: 14, textAlign: "center", marginTop: 40 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.bg,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: C.muted },
  sectionTotal: { fontSize: 12, color: C.subtle },
  txn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  txnIcon: {
    width: 38,
    height: 38,
    borderRadius: R.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  txnMerchant: { fontSize: 14, color: C.text },
  txnSub: { fontSize: 12, color: C.subtle, marginTop: 2 },
  txnAmt: { fontSize: 14, color: C.text, fontWeight: "500" },
});
