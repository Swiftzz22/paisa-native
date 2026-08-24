import { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "./theme";
import { inr, relativeDate, categoryColor } from "./format";
import type { Txn } from "./api";

export type Flow = {
  type: "debit" | "credit";
  /** Period name, e.g. "August 2026" — shown under the title. */
  label: string;
  from: string;
  to: string;
};

/**
 * Everything that made up one side of a period's total, grouped by category.
 *
 * Filters the history already held in memory rather than fetching, so opening
 * it is instant. Rows open the edit modal, same as anywhere else.
 */
export function FlowDetailScreen({
  flow,
  items,
  onClose,
  onEdit,
}: {
  flow: Flow | null;
  items: Txn[];
  onClose: () => void;
  onEdit?: (t: Txn) => void;
}) {
  const { sections, total, count } = useMemo(() => {
    if (!flow) return { sections: [], total: 0, count: 0 };
    const from = new Date(flow.from).getTime();
    const to = new Date(flow.to).getTime();

    const matching = items.filter((t) => {
      if (t.type !== flow.type) return false;
      const at = new Date(t.occurredAt).getTime();
      return at >= from && at <= to;
    });

    const byCategory = new Map<string, Txn[]>();
    for (const t of matching) {
      const list = byCategory.get(t.category);
      if (list) list.push(t);
      else byCategory.set(t.category, [t]);
    }

    const sections = Array.from(byCategory.entries())
      .map(([title, data]) => ({
        title,
        data,
        total: data.reduce((s, t) => s + t.amount, 0),
      }))
      .sort((a, b) => b.total - a.total);

    return {
      sections,
      total: matching.reduce((s, t) => s + t.amount, 0),
      count: matching.length,
    };
  }, [flow, items]);

  const credit = flow?.type === "credit";

  return (
    <Modal
      visible={flow !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{credit ? "Received" : "Spent"}</Text>
            <Text style={styles.subtitle}>
              {flow?.label} · {count} {count === 1 ? "transaction" : "transactions"}
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

        <View style={styles.totalRow}>
          <Text style={[styles.totalAmount, credit && { color: C.green }]}>
            {credit ? "+" : "−"}
            {inr(total)}
          </Text>
          <Text style={styles.totalLabel}>
            across {sections.length}{" "}
            {sections.length === 1 ? "category" : "categories"}
          </Text>
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
          ListEmptyComponent={
            <Text style={styles.empty}>
              Nothing {credit ? "received" : "spent"} in this period.
            </Text>
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <View
                style={[
                  styles.sectionDot,
                  {
                    backgroundColor: credit
                      ? C.green
                      : categoryColor(section.title),
                  },
                ]}
              />
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
              <Text style={styles.sectionTotal}>{inr(section.total)}</Text>
            </View>
          )}
          renderItem={({ item: t }) => (
            <Pressable
              onPress={() => onEdit?.(t)}
              style={({ pressed }) => [styles.txn, pressed && { opacity: 0.6 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.txnMerchant} numberOfLines={1}>
                  {t.merchant}
                </Text>
                <Text style={styles.txnSub} numberOfLines={1}>
                  {relativeDate(t.occurredAt)} · {t.paymentMode}
                </Text>
              </View>
              <Text style={[styles.txnAmt, credit && { color: C.green }]}>
                {inr(t.amount)}
              </Text>
            </Pressable>
          )}
        />
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
    paddingBottom: 4,
  },
  title: { fontSize: 22, fontWeight: "700", color: C.text },
  subtitle: { fontSize: 12, color: C.subtle, marginTop: 2 },
  totalRow: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  totalAmount: { fontSize: 30, fontWeight: "700", color: C.text },
  totalLabel: { fontSize: 12, color: C.subtle, marginTop: 2 },
  list: { paddingHorizontal: 18, paddingBottom: 24 },
  empty: { color: C.subtle, fontSize: 14, textAlign: "center", marginTop: 40 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.bg,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: "600", color: C.text },
  sectionCount: { fontSize: 11, color: C.subtle },
  sectionTotal: { fontSize: 13, color: C.muted, fontWeight: "500" },
  txn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  txnMerchant: { fontSize: 14, color: C.text },
  txnSub: { fontSize: 12, color: C.subtle, marginTop: 2 },
  txnAmt: { fontSize: 14, color: C.text, fontWeight: "500" },
});
