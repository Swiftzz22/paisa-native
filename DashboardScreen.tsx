import { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { C } from "./theme";
import { inr, relativeDate, categoryIcon, categoryColor } from "./format";
import {
  AuthError,
  fetchDashboard,
  fetchInsights,
  type Dashboard,
  type InsightsBundle,
  type Period,
  type SyncResult,
  type Txn,
} from "./api";
import { PieChart } from "./PieChart";
import { tapSelection } from "./haptics";

/** "2 new · 14 dates fixed" — or "Up to date" when a sync changed nothing. */
function summarizeSync(s: SyncResult): string {
  const parts: string[] = [];
  if (s.parsed > 0) parts.push(`${s.parsed} new`);
  if ((s.datesFixed ?? 0) > 0) parts.push(`${s.datesFixed} dates fixed`);
  if ((s.pending ?? 0) > 0) parts.push(`${s.pending} pending`);
  return parts.length > 0 ? parts.join(" · ") : "Up to date";
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

export function DashboardScreen({
  token,
  version,
  syncing,
  lastSync,
  onSync,
  onEdit,
  onNeedAuth,
  onUser,
}: {
  token: string;
  version: number;
  syncing?: boolean;
  lastSync?: SyncResult | null;
  onSync?: () => Promise<void>;
  onEdit?: (t: Txn) => void;
  onNeedAuth: () => void;
  onUser?: (u: Dashboard["user"]) => void;
}) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [bundle, setBundle] = useState<InsightsBundle | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  // Every period arrives in one payload, so switching tabs is local state.
  const insights = bundle ? bundle[period] : null;

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await fetchDashboard(token);
      setData(d);
      onUser?.(d.user);
    } catch (e) {
      if (e instanceof AuthError) return onNeedAuth();
      setError("Couldn't load your data. Pull to retry.");
    }
  }, [token, onNeedAuth, onUser]);

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      setBundle(await fetchInsights(token));
    } catch (e) {
      if (e instanceof AuthError) return onNeedAuth();
      // Non-fatal — the rest of the dashboard still renders.
    } finally {
      setInsightsLoading(false);
    }
  }, [token, onNeedAuth]);

  useEffect(() => {
    load();
  }, [load, version]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights, version]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (onSync) await onSync();
    await load();
    setRefreshing(false);
  }, [load, onSync]);

  if (!data && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  const down = data ? data.deltaPercent <= 0 : true;
  const deltaPct = data ? Math.abs(Math.round(data.deltaPercent * 100)) : 0;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.muted} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.brand}>
          paisa<Text style={{ color: C.subtle }}>.</Text>
        </Text>
        {syncing ? (
          <View style={styles.syncPill}>
            <ActivityIndicator size="small" color={C.muted} />
            <Text style={styles.syncText}>Syncing…</Text>
          </View>
        ) : data?.user?.name ? (
          <Text style={styles.hi}>Hi, {data.user.name.split(" ")[0]}</Text>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {lastSync && !syncing ? (
        <Text style={[styles.syncNote, lastSync.error ? { color: C.red } : null]}>
          {lastSync.error
            ? `Sync failed — ${lastSync.error}`
            : summarizeSync(lastSync)}
        </Text>
      ) : null}

      {data ? (
        <>
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Spent in {data.monthLabel}</Text>
            <View style={styles.heroRow}>
              <Text style={styles.heroAmount}>{inr(data.spent)}</Text>
              {deltaPct > 0 ? (
                <View style={[styles.pill, !down && styles.pillUp]}>
                  <Ionicons
                    name={down ? "arrow-down" : "arrow-up"}
                    size={12}
                    color={down ? C.green : C.red}
                  />
                  <Text style={[styles.pillText, !down && { color: C.red }]}>
                    {deltaPct}% vs last month
                  </Text>
                </View>
              ) : null}
            </View>

            {data.budget ? (
              <View style={{ marginTop: 16 }}>
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetText}>
                    {inr(data.budget.left)} left of {inr(data.budget.cap)}
                  </Text>
                  <Text style={styles.budgetText}>
                    day {data.budget.daysElapsed} / {data.budget.daysInMonth}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.trackFill,
                      {
                        width: `${data.budget.pct}%`,
                        backgroundColor: data.budget.pct >= 80 ? C.red : C.green,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : null}
          </View>

          <View style={{ marginTop: 24 }}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Insights</Text>
              <View style={styles.segment}>
                {PERIODS.map((p) => {
                  const active = period === p.key;
                  return (
                    <Pressable
                      key={p.key}
                      onPress={() => {
                        if (!active) tapSelection();
                        setPeriod(p.key);
                      }}
                      hitSlop={6}
                      // React to the touch itself, not just the state change —
                      // with no pressed feedback the control read as dead even
                      // when it was working.
                      style={({ pressed }) => [
                        styles.segmentItem,
                        active && styles.segmentItemActive,
                        pressed && !active && styles.segmentItemPressed,
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentLabel,
                          active && styles.segmentLabelActive,
                        ]}
                      >
                        {p.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View
              style={[
                styles.insightsCard,
                // Dim on refresh rather than freezing the old numbers with no
                // indication anything is happening.
                insightsLoading && insights ? { opacity: 0.55 } : null,
              ]}
            >
              <Text style={styles.insightsLabel}>
                Net {insights?.label ? `· ${insights.label}` : ""}
              </Text>
              <Text style={styles.insightsAmount}>
                {insights
                  ? `${insights.net < 0 ? "+" : ""}${inr(Math.abs(insights.net))}`
                  : "—"}
              </Text>
              {insights ? (
                <Text style={styles.insightsSub}>
                  {insights.net < 0 ? "more came in than went out · " : ""}
                  {insights.txCount}{" "}
                  {insights.txCount === 1 ? "transaction" : "transactions"}
                </Text>
              ) : null}

              {insights ? (
                <View style={styles.flowRow}>
                  <View style={styles.flowCell}>
                    <Text style={styles.flowLabel}>Spent</Text>
                    <Text style={styles.flowSpent}>−{inr(insights.spent)}</Text>
                  </View>
                  <View style={styles.flowDivider} />
                  <View style={styles.flowCell}>
                    <Text style={styles.flowLabel}>Received</Text>
                    <Text style={styles.flowReceived}>
                      +{inr(insights.received)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {insightsLoading && !insights ? (
                <View style={{ paddingVertical: 30 }}>
                  <ActivityIndicator color={C.muted} />
                </View>
              ) : insights && insights.categories.length === 0 ? (
                <Text style={[styles.empty, { marginTop: 14 }]}>
                  No spending in this period.
                </Text>
              ) : insights ? (
                <>
                  <View style={styles.pieRow}>
                    <PieChart
                      data={insights.categories.map((c) => ({
                        key: c.name,
                        amount: c.amount,
                        color: c.color,
                      }))}
                      size={160}
                      thickness={22}
                      trackColor={C.bg}
                    />
                    <View style={styles.pieLegend}>
                      {insights.categories.slice(0, 5).map((c) => (
                        <View key={c.name} style={styles.legendRow}>
                          <View style={[styles.legendDot, { backgroundColor: c.color }]} />
                          <Text style={styles.legendName} numberOfLines={1}>
                            {c.name}
                          </Text>
                          <Text style={styles.legendPct}>{c.pct}%</Text>
                        </View>
                      ))}
                      {insights.categories.length > 5 ? (
                        <Text style={styles.legendMore}>
                          +{insights.categories.length - 5} more
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {insights.paymentModes.length > 0 ? (
                    <View style={styles.modesBlock}>
                      <Text style={styles.modesTitle}>By payment mode</Text>
                      <View style={styles.modesRow}>
                        {insights.paymentModes.map((p) => (
                          <View key={p.mode} style={styles.modeChip}>
                            <View style={[styles.legendDot, { backgroundColor: p.color }]} />
                            <Text style={styles.modeLabel}>{p.label}</Text>
                            <Text style={styles.modeAmount}>{inr(p.amount)}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          </View>

          <View style={{ marginTop: 24 }}>
            <Text style={styles.sectionTitle}>Where it went (this month)</Text>
            <View style={{ marginTop: 14 }}>
              {data.categories.length === 0 ? (
                <Text style={styles.empty}>No spending this month yet.</Text>
              ) : (
                data.categories.map((c) => (
                  <View key={c.name} style={styles.catRow}>
                    <View style={[styles.dot, { backgroundColor: c.color }]} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.catTop}>
                        <Text style={styles.catName}>{c.name}</Text>
                        <Text style={styles.catAmt}>{inr(c.amount)}</Text>
                      </View>
                      <View style={styles.catTrack}>
                        <View
                          style={[styles.catFill, { width: `${c.pct}%`, backgroundColor: c.color }]}
                        />
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={{ marginTop: 26 }}>
            <Text style={styles.sectionTitle}>Recent</Text>
            <View style={{ marginTop: 6 }}>
              {data.recent.length === 0 ? (
                <Text style={styles.empty}>No transactions yet.</Text>
              ) : (
                data.recent.map((t, i) => {
                  const credit = t.type === "credit";
                  const tint = credit ? C.green : categoryColor(t.category);
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => onEdit?.(t)}
                      style={[styles.txn, i < data.recent.length - 1 && styles.txnBorder]}
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
                          {t.category} · {relativeDate(t.occurredAt)}
                        </Text>
                      </View>
                      <Text style={[styles.txnAmt, credit && { color: C.green }]}>
                        {credit ? "+" : "−"}
                        {inr(t.amount)}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 18, paddingBottom: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  brand: { fontSize: 20, fontWeight: "600", color: C.text },
  hi: { fontSize: 13, color: C.muted },
  syncPill: { flexDirection: "row", alignItems: "center", gap: 6 },
  syncText: { fontSize: 12, color: C.muted },
  syncNote: { fontSize: 11, color: C.subtle, paddingBottom: 6 },
  errorCard: { backgroundColor: C.redBg, borderRadius: 12, padding: 14, marginTop: 6 },
  errorText: { color: C.red, fontSize: 13 },
  hero: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 20,
    marginTop: 6,
  },
  heroLabel: { fontSize: 13, color: C.muted },
  heroRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    marginTop: 6,
    flexWrap: "wrap",
  },
  heroAmount: { fontSize: 36, fontWeight: "700", color: C.text },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: C.greenBg,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pillUp: { backgroundColor: C.redBg },
  pillText: { fontSize: 12, color: C.green, fontWeight: "500" },
  budgetRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  budgetText: { fontSize: 12, color: C.muted },
  track: { height: 6, backgroundColor: "#000", borderRadius: 99, overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: 99 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: C.text },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  segment: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 3,
  },
  segmentItem: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  segmentItemActive: { backgroundColor: C.accent },
  segmentItemPressed: { backgroundColor: C.card2 },
  segmentLabel: { fontSize: 12, color: C.muted, fontWeight: "500" },
  segmentLabelActive: { color: "#fff" },
  insightsCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 20,
    marginTop: 14,
  },
  insightsLabel: { fontSize: 13, color: C.muted },
  insightsAmount: {
    fontSize: 30,
    fontWeight: "700",
    color: C.text,
    marginTop: 4,
  },
  insightsSub: { fontSize: 12, color: C.subtle, marginTop: 2 },
  flowRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.bg,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 16,
  },
  flowCell: { flex: 1, alignItems: "center", gap: 3 },
  flowDivider: { width: 0.5, alignSelf: "stretch", backgroundColor: C.border },
  flowLabel: { fontSize: 11, color: C.subtle },
  flowSpent: { fontSize: 16, fontWeight: "600", color: C.text },
  flowReceived: { fontSize: 16, fontWeight: "600", color: C.green },
  pieRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 18,
  },
  pieLegend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendName: { flex: 1, fontSize: 13, color: C.text },
  legendPct: { fontSize: 13, color: C.muted, fontWeight: "500" },
  legendMore: { fontSize: 12, color: C.subtle, marginTop: 2 },
  modesBlock: { marginTop: 18 },
  modesTitle: { fontSize: 12, color: C.subtle, marginBottom: 8 },
  modesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modeLabel: { fontSize: 12, color: C.text },
  modeAmount: { fontSize: 12, color: C.muted, fontWeight: "500" },
  empty: { color: C.subtle, fontSize: 13, paddingVertical: 8 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  catTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  catName: { fontSize: 14, color: C.text },
  catAmt: { fontSize: 14, color: C.text, fontWeight: "500" },
  catTrack: { height: 5, backgroundColor: C.card, borderRadius: 99, overflow: "hidden" },
  catFill: { height: "100%", borderRadius: 99 },
  txn: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  txnBorder: { borderBottomWidth: 0.5, borderBottomColor: C.border },
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
