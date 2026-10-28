import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { C, MONO, R, SPACE } from "./theme";
import { inr, inrCompact } from "./format";
import {
  AuthError,
  fetchCalendarDay,
  fetchCalendarMonth,
  type CalendarMonthData,
  type Txn,
} from "./api";
import { tapLight, tapSelection } from "./haptics";
import { useReduceMotion } from "./useReduceMotion";
import { useHiddenTxnIds } from "./undoDelete";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Rupee blue, deeper as a day's spend nears the month's biggest day. */
function heat(total: number, max: number): string {
  const t = max > 0 ? Math.min(1, total / max) : 0;
  return `rgba(59,130,246,${(0.1 + t * 0.7).toFixed(2)})`;
}

/**
 * The month as a grid of days, shaded by how much went out on each, with the
 * no-spend days ringed in green — the days worth noticing when you are trying
 * to spend less. Tap a day for what made it up.
 *
 * Hides itself entirely if the server cannot answer, so an older backend or a
 * bad connection costs the dashboard a card rather than showing an error.
 */
export function SpendingCalendar({
  token,
  version,
  onEdit,
  onNeedAuth,
}: {
  token: string;
  version: number;
  onEdit?: (t: Txn) => void;
  onNeedAuth: () => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [data, setData] = useState<CalendarMonthData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchCalendarMonth(token, monthKey(month))
      .then((d) => {
        if (!alive) return;
        setData(d);
        setFailed(false);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof AuthError) return onNeedAuth();
        setFailed(true);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token, month, version, onNeedAuth]);

  if (failed || !data) return null;

  const year = month.getFullYear();
  const m = month.getMonth();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const lead = (new Date(year, m, 1).getDay() + 6) % 7; // Monday-first
  const byKey = new Map(data.days.map((d) => [d.date, d]));
  const now = new Date();
  const todayKey = dayKey(now.getFullYear(), now.getMonth(), now.getDate());
  const isCurrent = monthKey(month) === monthKey(now);

  const step = (delta: number) => {
    tapSelection();
    setMonth(new Date(year, m + delta, 1));
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <View style={[styles.card, loading && { opacity: 0.6 }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {MONTHS[m]}
            {year !== now.getFullYear() ? ` ${year}` : ""}
          </Text>
          <Text style={styles.meta}>
            <Text style={{ color: C.green }}>
              {data.noSpendDays} no-spend {data.noSpendDays === 1 ? "day" : "days"}
            </Text>
          </Text>
        </View>
        <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityLabel="Previous month" style={styles.arrow}>
          <Ionicons name="chevron-back" size={18} color={C.muted} />
        </Pressable>
        <Pressable
          onPress={() => step(1)}
          disabled={isCurrent}
          hitSlop={10}
          accessibilityLabel="Next month"
          style={[styles.arrow, isCurrent && { opacity: 0.3 }]}
        >
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Pressable>
      </View>

      <View style={styles.row}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d == null) return <View key={`pad${i}`} style={styles.cell} />;
          const key = dayKey(year, m, d);
          const day = byKey.get(key);
          const zero = day != null && day.total === 0;
          const today = key === todayKey;
          const label = day
            ? `${d} ${MONTHS[m]}: ${zero ? "no spending" : `${inr(day.total)}, ${day.count} transactions`}`
            : `${d} ${MONTHS[m]}`;
          return (
            <View key={key} style={styles.cell}>
              <Pressable
                disabled={!day}
                onPress={() => {
                  tapLight();
                  setPicked(key);
                }}
                accessibilityLabel={label}
                style={({ pressed }) => [
                  styles.day,
                  day && day.total > 0 && { backgroundColor: heat(day.total, data.max) },
                  zero && styles.zero,
                  today && styles.today,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={[styles.dayNum, !day && { color: C.subtle }]}>{d}</Text>
                {day && day.total > 0 ? (
                  <Text style={styles.dayAmt} numberOfLines={1}>
                    {inrCompact(day.total)}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>

      <DaySheet
        token={token}
        day={picked}
        total={picked ? byKey.get(picked)?.total ?? 0 : 0}
        onClose={() => setPicked(null)}
        onEdit={(t) => {
          setPicked(null);
          onEdit?.(t);
        }}
        onNeedAuth={onNeedAuth}
      />
    </View>
  );
}

function DaySheet({
  token,
  day,
  total,
  onClose,
  onEdit,
  onNeedAuth,
}: {
  token: string;
  day: string | null;
  total: number;
  onClose: () => void;
  onEdit: (t: Txn) => void;
  onNeedAuth: () => void;
}) {
  const reduce = useReduceMotion();
  const hidden = useHiddenTxnIds();
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!day) return;
    let alive = true;
    setTxns(null);
    setError(false);
    fetchCalendarDay(token, day)
      .then((r) => alive && setTxns(r.transactions))
      .catch((e) => {
        if (!alive) return;
        if (e instanceof AuthError) return onNeedAuth();
        setError(true);
      });
    return () => {
      alive = false;
    };
  }, [token, day, onNeedAuth]);

  const title = day
    ? new Date(`${day}T12:00:00`).toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";
  const shown = txns?.filter((t) => !hidden.has(t.id)) ?? null;

  return (
    <Modal
      visible={day !== null}
      transparent
      animationType={reduce ? "fade" : "slide"}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.grab} />
        <View style={styles.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Text style={styles.sheetTotal}>{total > 0 ? `${inr(total)} spent` : "Nothing spent"}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={C.muted} />
          </Pressable>
        </View>

        {error ? (
          <Text style={styles.sheetEmpty}>Couldn't load this day. Try again in a moment.</Text>
        ) : !shown ? (
          <ActivityIndicator color={C.accent} style={{ paddingVertical: 32 }} />
        ) : shown.length === 0 ? (
          <Text style={styles.sheetEmpty}>No transactions on this day.</Text>
        ) : (
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {shown.map((t, i) => (
              <Pressable
                key={t.id}
                onPress={() => {
                  tapLight();
                  onEdit(t);
                }}
                style={({ pressed }) => [
                  styles.txn,
                  i < shown.length - 1 && styles.txnBorder,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.txnMerchant} numberOfLines={1}>
                    {t.merchant}
                  </Text>
                  <Text style={styles.txnCat}>{t.category}</Text>
                </View>
                <Text style={[styles.txnAmt, t.type === "credit" && { color: C.green }]}>
                  {t.type === "credit" ? "+" : "−"}
                  {inr(t.amount)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: R.card,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: SPACE.card,
    marginTop: 24,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: "700", color: C.text },
  meta: { fontSize: 12, color: C.muted, marginTop: 2 },
  arrow: { padding: 6 },
  row: { flexDirection: "row" },
  weekday: { width: `${100 / 7}%`, textAlign: "center", color: C.subtle, fontSize: 11, marginBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  day: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  zero: { borderColor: C.green, borderStyle: "dashed" },
  today: { borderColor: C.highlight, borderStyle: "solid" },
  dayNum: { color: C.text, fontSize: 13, fontWeight: "500" },
  dayAmt: { color: C.text, fontSize: 9, fontFamily: MONO, opacity: 0.85, marginTop: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: R.card,
    borderTopRightRadius: R.card,
    borderWidth: 0.5,
    borderColor: C.border,
    paddingHorizontal: SPACE.card,
    paddingTop: 8,
    paddingBottom: 34,
  },
  grab: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: R.pill,
    backgroundColor: C.border,
    marginBottom: 12,
  },
  sheetHead: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: C.text },
  sheetTotal: { fontSize: 14, color: C.muted, marginTop: 4, fontFamily: MONO },
  sheetEmpty: { color: C.muted, fontSize: 14, paddingVertical: 28, textAlign: "center" },
  txn: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  txnBorder: { borderBottomWidth: 0.5, borderBottomColor: C.border },
  txnMerchant: { color: C.text, fontSize: 15, fontWeight: "500" },
  txnCat: { color: C.muted, fontSize: 12, marginTop: 2 },
  txnAmt: { color: C.text, fontSize: 15, fontFamily: MONO },
});
