import { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { C } from "./theme";
import { inr, relativeDate, categoryIcon, categoryColor } from "./format";
import { AuthError, fetchTransactions, type Txn } from "./api";

export function TransactionsScreen({
  token,
  version,
  onSync,
  onEdit,
  onNeedAuth,
}: {
  token: string;
  version: number;
  onSync?: () => Promise<void>;
  onEdit?: (t: Txn) => void;
  onNeedAuth: () => void;
}) {
  const [items, setItems] = useState<Txn[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirst = useCallback(async () => {
    setError(null);
    try {
      const { items, nextCursor } = await fetchTransactions(token);
      setItems(items);
      setCursor(nextCursor);
    } catch (e) {
      if (e instanceof AuthError) return onNeedAuth();
      setError("Couldn't load transactions.");
    } finally {
      setLoading(false);
    }
  }, [token, onNeedAuth]);

  useEffect(() => {
    setLoading(true);
    loadFirst();
  }, [loadFirst, version]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (onSync) await onSync();
    await loadFirst();
    setRefreshing(false);
  }, [loadFirst, onSync]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { items: more, nextCursor } = await fetchTransactions(token, cursor);
      setItems((prev) => [...prev, ...more]);
      setCursor(nextCursor);
    } catch (e) {
      if (e instanceof AuthError) onNeedAuth();
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, token, onNeedAuth]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(t) => t.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      onRefresh={onRefresh}
      refreshing={refreshing}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Activity</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          Nothing here yet. Tap + to add your first transaction.
        </Text>
      }
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator color={C.subtle} style={{ marginVertical: 16 }} />
        ) : null
      }
      renderItem={({ item: t }) => {
        const credit = t.type === "credit";
        const tint = credit ? C.green : categoryColor(t.category);
        return (
          <Pressable style={styles.txn} onPress={() => onEdit?.(t)}>
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
                {t.category} · {relativeDate(t.occurredAt)} · {t.paymentMode}
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
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 18, paddingBottom: 24 },
  header: { paddingVertical: 10 },
  title: { fontSize: 24, fontWeight: "700", color: C.text },
  error: { color: C.red, fontSize: 13, marginTop: 6 },
  empty: { color: C.subtle, fontSize: 14, textAlign: "center", marginTop: 40 },
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
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  txnMerchant: { fontSize: 14, color: C.text },
  txnSub: { fontSize: 12, color: C.subtle, marginTop: 2 },
  txnAmt: { fontSize: 14, color: C.text, fontWeight: "500" },
});
