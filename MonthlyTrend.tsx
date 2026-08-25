import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "./theme";
import { inr, inrCompact } from "./format";
import { tapSelection } from "./haptics";
import type { MonthlyBar } from "./api";

/**
 * Twelve months of spending as a bar chart.
 *
 * Plain views rather than SVG — the bars are rectangles, and this way each one
 * is its own touch target. Tapping a bar names the month and its total instead
 * of relying on a tooltip, which has no hover to hang off on a phone.
 */
export function MonthlyTrend({
  data,
  onMonthPress,
}: {
  data: MonthlyBar[];
  /** Opens that month's breakdown. */
  onMonthPress?: (bar: MonthlyBar) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.total), 1);
  const allEmpty = data.every((d) => d.total === 0);
  const current = data[data.length - 1]?.key ?? null;
  const shown = data.find((d) => d.key === (picked ?? current)) ?? null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Last 12 months</Text>
        {shown ? (
          <Text style={styles.readout}>
            {shown.label} · {inr(shown.total)}
          </Text>
        ) : null}
      </View>
      <Text style={styles.hint}>Tap a month to see where it went.</Text>

      {allEmpty ? (
        <Text style={styles.empty}>No spending in the last 12 months.</Text>
      ) : (
        <View style={styles.plot}>
          {data.map((m) => {
            const active = m.key === (picked ?? current);
            // Keep a sliver visible for empty months so the axis still reads
            // as twelve slots rather than a gap.
            const h = m.total === 0 ? 2 : Math.max(4, (m.total / max) * 96);
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  tapSelection();
                  setPicked(m.key);
                  // Months with nothing in them have no breakdown to show.
                  if (m.total > 0) onMonthPress?.(m);
                }}
                hitSlop={4}
                style={styles.col}
              >
                <Text
                  style={[styles.value, active && { color: C.text }]}
                  numberOfLines={1}
                >
                  {inrCompact(m.total)}
                </Text>
                <View
                  style={[
                    styles.bar,
                    { height: h, backgroundColor: active ? C.accent : C.card2 },
                  ]}
                />
                <Text
                  style={[styles.tick, active && { color: C.text }]}
                  numberOfLines={1}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 18,
    marginTop: 14,
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  hint: { fontSize: 11, color: C.subtle, marginBottom: 12 },
  title: { fontSize: 13, color: C.muted },
  readout: { fontSize: 13, color: C.text, fontWeight: "600" },
  empty: { fontSize: 13, color: C.subtle, paddingVertical: 20 },
  plot: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 140,
    gap: 3,
  },
  col: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  bar: { width: "100%", borderRadius: 4, minHeight: 2 },
  // 8px keeps "2.4L" inside a twelve-column layout on a narrow phone.
  value: { fontSize: 8, color: C.subtle, marginBottom: 4 },
  tick: { fontSize: 9, color: C.subtle, marginTop: 6 },
});
