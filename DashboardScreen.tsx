import { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Animated,
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
  fetchRangeInsights,
  type Dashboard,
  type Insights,
  type InsightsBundle,
  type MonthlyBar,
  type Period,
  type SyncResult,
  type Txn,
} from "./api";
import { PieChart } from "./PieChart";
import { MonthlyTrend } from "./MonthlyTrend";
import { CustomRangeSheet, type CustomRange } from "./CustomRangeSheet";
import { GettingStarted } from "./GettingStarted";
import { connectGmail } from "./googleSignIn";
import { AnimatedNumber } from "./AnimatedNumber";
import { SegmentedControl } from "./SegmentedControl";
import { tapLight } from "./haptics";
import type { Flow } from "./FlowDetailScreen";

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

const FALLBACK_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4",
  "#ec4899", "#14b8a6", "#84cc16", "#eab308", "#6366f1", "#71717a",
];

const PAYMENT_LABELS: Record<string, string> = {
  card: "Card",
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
};
const PAYMENT_COLORS: Record<string, string> = {
  card: "#3b82f6",
  upi: "#22c55e",
  cash: "#f59e0b",
  bank_transfer: "#a855f7",
};

function rangeLabel(from: Date, to: Date): string {
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const one = (d: Date) => `${d.getDate()} ${M[d.getMonth()]}`;
  const sameYear = from.getFullYear() === to.getFullYear();
  return sameYear
    ? `${one(from)} – ${one(to)} ${to.getFullYear()}`
    : `${one(from)} ${from.getFullYear()} – ${one(to)} ${to.getFullYear()}`;
}

/**
 * Build the same shape the server returns, but for an arbitrary window and from
 * the history already on the device — so a custom range costs no request.
 * Colours are borrowed from the year's breakdown so a category keeps the colour
 * it has everywhere else.
 */
function summarizeRange(
  items: Txn[],
  from: Date,
  to: Date,
  colorOf: (name: string) => string
): Insights {
  const inRange = items.filter((t) => {
    const at = new Date(t.occurredAt).getTime();
    return at >= from.getTime() && at <= to.getTime();
  });

  let spent = 0;
  let received = 0;
  const cats = new Map<string, { amount: number; txCount: number }>();
  const modes = new Map<string, { amount: number; txCount: number }>();
  for (const t of inRange) {
    if (t.type === "credit") {
      received += t.amount;
      continue;
    }
    spent += t.amount;
    const c = cats.get(t.category) ?? { amount: 0, txCount: 0 };
    c.amount += t.amount;
    c.txCount++;
    cats.set(t.category, c);
    const m = modes.get(t.paymentMode) ?? { amount: 0, txCount: 0 };
    m.amount += t.amount;
    m.txCount++;
    modes.set(t.paymentMode, m);
  }
  const denom = spent || 1;

  return {
    period: "month",
    label: rangeLabel(from, to),
    from: from.toISOString(),
    to: to.toISOString(),
    spent: Math.round(spent),
    received: Math.round(received),
    net: Math.round(spent - received),
    txCount: inRange.length,
    categories: Array.from(cats.entries())
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([name, v]) => ({
        name,
        amount: Math.round(v.amount),
        pct: Math.round((v.amount / denom) * 100),
        color: colorOf(name),
        txCount: v.txCount,
      })),
    paymentModes: Array.from(modes.entries())
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([mode, v]) => ({
        mode,
        label: PAYMENT_LABELS[mode] ?? mode,
        amount: Math.round(v.amount),
        pct: Math.round((v.amount / denom) * 100),
        color: PAYMENT_COLORS[mode] ?? "#71717a",
        txCount: v.txCount,
      })),
  };
}

export function DashboardScreen({
  token,
  version,
  syncing,
  lastSync,
  onSync,
  onEdit,
  onNeedAuth,
  onUser,
  onOpenFlow,
  onAdd,
  items,
}: {
  /** Opens the add-transaction sheet from the empty state. */
  onAdd?: () => void;
  token: string;
  version: number;
  /** History held by the shell — lets a custom range be summarised locally. */
  items: Txn[];
  syncing?: boolean;
  lastSync?: SyncResult | null;
  onOpenFlow?: (flow: Flow) => void;
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
  const [monthly, setMonthly] = useState<MonthlyBar[]>([]);
  const [showAllCats, setShowAllCats] = useState(false);
  const [custom, setCustom] = useState<CustomRange | null>(null);
  const [serverCustom, setServerCustom] = useState<Insights | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [rangeSheet, setRangeSheet] = useState(false);

  const colorOf = useCallback(
    (name: string) => {
      const known = bundle?.year.categories.find((c) => c.name === name);
      if (known) return known.color;
      // Stable per name, so an unseen category does not flicker between renders.
      let h = 0;
      for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
      return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length];
    },
    [bundle]
  );

  // Every period arrives in one payload, so switching tabs is local state.
  //
  // A custom window is summarised on the device first, which is instant but
  // only sees the history held locally. The server's answer for the same window
  // replaces it as soon as it lands, so the numbers end up complete.
  const localCustom = custom
    ? summarizeRange(items, custom.from, custom.to, colorOf)
    : null;
  const insights = custom
    ? serverCustom ?? localCustom
    : bundle
      ? bundle[period]
      : null;

  useEffect(() => {
    if (!custom) {
      setServerCustom(null);
      return;
    }
    let cancelled = false;
    setServerCustom(null);
    fetchRangeInsights(token, custom.from, custom.to)
      .then((r) => {
        if (!cancelled) setServerCustom(r);
      })
      .catch(() => {
        // Keep the local summary; it is right for everything recent.
      });
    return () => {
      cancelled = true;
    };
  }, [custom, token]);

  /**
   * Narrow the whole card to one month from the trend chart, rather than
   * opening a separate sheet — the pie and the category list then describe the
   * month you tapped. The key is "YYYY-MM" in the device's own timezone, the
   * same one the server bucketed by, so the range is rebuilt here for free.
   */
  const openMonth = useCallback((bar: MonthlyBar) => {
    const [y, m] = bar.key.split("-").map(Number);
    tapLight();
    setCustom({
      from: new Date(y, m - 1, 1, 0, 0, 0, 0),
      to: new Date(y, m, 0, 23, 59, 59, 999),
    });
  }, []);

  const openCategory = useCallback(
    (category: string) => {
      if (!insights) return;
      tapLight();
      onOpenFlow?.({
        type: "debit",
        label: insights.label,
        from: insights.from,
        to: insights.to,
        category,
      });
    },
    [insights, onOpenFlow]
  );

  // Re-dissolve the chart whenever the period changes. The numbers count to
  // their new values separately, so the card reads as one continuous change
  // rather than a hard swap. Native driver, so it survives a busy JS thread.
  const chartFade = useRef(new Animated.Value(1)).current;
  const chartScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    chartFade.setValue(0.35);
    chartScale.setValue(0.94);
    Animated.parallel([
      Animated.timing(chartFade, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.spring(chartScale, {
        toValue: 1,
        speed: 18,
        bounciness: 5,
        useNativeDriver: true,
      }),
    ]).start();
  }, [period, chartFade, chartScale]);

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
      const payload = await fetchInsights(token);
      setBundle(payload.periods);
      setMonthly(payload.monthly);
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

      {data && data.recent.length === 0 ? (
        <GettingStarted
          emailConnected={data.emailConnected ?? false}
          onAdd={() => onAdd?.()}
          connecting={connecting}
          onConnect={async () => {
            tapLight();
            setConnecting(true);
            const res = await connectGmail(token);
            setConnecting(false);
            if (res.ok) {
              // Reload so the card flips to "looking through your inbox", and
              // pull straight away rather than making them wait for the cron.
              await load();
              await onSync?.();
            } else if (!res.cancelled) {
              setError(res.message);
            }
          }}
        />
      ) : null}

      {data && data.recent.length > 0 ? (
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
              <SegmentedControl
                items={PERIODS}
                value={period}
                onChange={(p) => {
                  setCustom(null);
                  setPeriod(p);
                }}
              />
            </View>

            <Pressable
              onPress={() => {
                tapLight();
                setRangeSheet(true);
              }}
              hitSlop={6}
              style={({ pressed }) => [
                styles.customRow,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons
                name="calendar-outline"
                size={13}
                color={custom ? C.accent : C.subtle}
              />
              <Text
                style={[styles.customLabel, custom && { color: C.accent }]}
              >
                {custom ? insights?.label ?? "Custom range" : "Custom range"}
              </Text>
              {custom ? (
                <Pressable
                  onPress={() => {
                    tapLight();
                    setCustom(null);
                  }}
                  hitSlop={10}
                >
                  <Ionicons name="close-circle" size={15} color={C.subtle} />
                </Pressable>
              ) : (
                <Ionicons name="chevron-forward" size={13} color={C.subtle} />
              )}
            </Pressable>

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
              {insights ? (
                <AnimatedNumber
                  value={insights.net}
                  format={(n) => `${n < 0 ? "+" : ""}${inr(Math.abs(n))}`}
                  style={styles.insightsAmount}
                />
              ) : (
                <Text style={styles.insightsAmount}>—</Text>
              )}
              {insights ? (
                <Text style={styles.insightsSub}>
                  {insights.net < 0 ? "more came in than went out · " : ""}
                  {insights.txCount}{" "}
                  {insights.txCount === 1 ? "transaction" : "transactions"}
                </Text>
              ) : null}

              {insights ? (
                <View style={styles.flowRow}>
                  <Pressable
                    onPress={() => {
                      tapLight();
                      onOpenFlow?.({
                        type: "debit",
                        label: insights.label,
                        from: insights.from,
                        to: insights.to,
                      });
                    }}
                    style={({ pressed }) => [
                      styles.flowCell,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <Text style={styles.flowLabel}>Spent</Text>
                    <AnimatedNumber
                      value={insights.spent}
                      format={(n) => `−${inr(n)}`}
                      style={styles.flowSpent}
                    />
                    <Text style={styles.flowHint}>view</Text>
                  </Pressable>
                  <View style={styles.flowDivider} />
                  <Pressable
                    onPress={() => {
                      tapLight();
                      onOpenFlow?.({
                        type: "credit",
                        label: insights.label,
                        from: insights.from,
                        to: insights.to,
                      });
                    }}
                    style={({ pressed }) => [
                      styles.flowCell,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <Text style={styles.flowLabel}>Received</Text>
                    <AnimatedNumber
                      value={insights.received}
                      format={(n) => `+${inr(n)}`}
                      style={styles.flowReceived}
                    />
                    <Text style={styles.flowHint}>view</Text>
                  </Pressable>
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
                  <Animated.View
                    style={[
                      styles.pieRow,
                      { opacity: chartFade, transform: [{ scale: chartScale }] },
                    ]}
                  >
                    <PieChart
                      data={insights.categories.map((c) => ({
                        key: c.name,
                        amount: c.amount,
                        color: c.color,
                      }))}
                      size={160}
                      thickness={22}
                      trackColor={C.bg}
                      onSlicePress={openCategory}
                    />
                    <View style={styles.pieLegend}>
                      {(showAllCats
                        ? insights.categories
                        : insights.categories.slice(0, 5)
                      ).map((c) => (
                        <Pressable
                          key={c.name}
                          onPress={() => openCategory(c.name)}
                          hitSlop={4}
                          style={({ pressed }) => [
                            styles.legendRow,
                            pressed && { opacity: 0.55 },
                          ]}
                        >
                          <View style={[styles.legendDot, { backgroundColor: c.color }]} />
                          <Text style={styles.legendName} numberOfLines={1}>
                            {c.name}
                          </Text>
                          <Text style={styles.legendPct}>{c.pct}%</Text>
                        </Pressable>
                      ))}
                      {insights.categories.length > 5 ? (
                        <Pressable
                          onPress={() => {
                            tapLight();
                            setShowAllCats((v) => !v);
                          }}
                          hitSlop={6}
                          style={({ pressed }) => pressed && { opacity: 0.6 }}
                        >
                          <Text style={styles.legendMore}>
                            {showAllCats
                              ? "Show less"
                              : `Show all ${insights.categories.length}`}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </Animated.View>

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

          {/* A twelve-month trend only means something against a yearly view;
              beside a Day or Week figure it was just noise. Stays visible after
              picking a month so you can step through them and watch the
              breakdown above follow along. */}
          {period === "year" ? (
            <MonthlyTrend data={monthly} onMonthPress={openMonth} />
          ) : null}

          <CustomRangeSheet
            visible={rangeSheet}
            initial={custom}
            onClose={() => setRangeSheet(false)}
            onApply={(r) => {
              setCustom(r);
              setRangeSheet(false);
            }}
          />

          <View style={{ marginTop: 24 }}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Where it went</Text>
              {insights ? (
                <Text style={styles.sectionMeta}>{insights.label}</Text>
              ) : null}
            </View>
            <View style={{ marginTop: 14 }}>
              {!insights || insights.categories.length === 0 ? (
                <Text style={styles.empty}>No spending in this period.</Text>
              ) : (
                // Bars are relative to the biggest category, so the smallest
                // stays visible instead of collapsing to nothing.
                insights.categories.map((c) => {
                  const widest = insights.categories[0].amount || 1;
                  const w = Math.max(3, Math.round((c.amount / widest) * 100));
                  return (
                    <Pressable
                      key={c.name}
                      onPress={() => openCategory(c.name)}
                      hitSlop={4}
                      style={({ pressed }) => [
                        styles.catRow,
                        pressed && { opacity: 0.55 },
                      ]}
                    >
                      <View style={[styles.dot, { backgroundColor: c.color }]} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.catTop}>
                          <Text style={styles.catName}>{c.name}</Text>
                          <Text style={styles.catAmt}>{inr(c.amount)}</Text>
                        </View>
                        <View style={styles.catTrack}>
                          <View
                            style={[
                              styles.catFill,
                              { width: `${w}%`, backgroundColor: c.color },
                            ]}
                          />
                        </View>
                      </View>
                    </Pressable>
                  );
                })
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
                          {t.category} · {relativeDate(t.occurredAt, t.timeKnown)}
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
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-end",
    paddingTop: 8,
  },
  customLabel: { fontSize: 12, color: C.subtle },
  sectionMeta: { fontSize: 12, color: C.subtle },
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
  flowHint: { fontSize: 10, color: C.accent, marginTop: 2 },
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
