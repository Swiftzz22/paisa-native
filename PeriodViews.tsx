import React, { useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "./theme";
import { inr } from "./format";
import type { DayTotal, Highlight, Period } from "./api";
import { dateKey, type PeriodWindow } from "./period";

/**
 * Seeing a period without scrolling through it.
 *
 * The dashboard answered "what did I spend in May?" with a total and a long
 * list. These put the shape of a period on one screen: arrows to reach a past
 * one, the few transactions that moved the number, and every day at a glance.
 */

// ── Period navigation ─────────────────────────────────────────────────────

const GRAINS: { key: Period; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

export function PeriodNav({
  window: w,
  onPickDate,
  onGrain,
}: {
  window: PeriodWindow;
  /** A date chosen from the calendar; the grain decides what is shown. */
  onPickDate: (d: Date) => void;
  onGrain: (g: Period) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<Date>(() => new Date());

  // Always opens on today rather than on whatever period is being read, so the
  // calendar starts from the present however far back you have wandered.
  function open() {
    setDraft(new Date());
    setPicking(true);
  }

  // Android's picker is a dialog that closes itself on choose or dismiss;
  // iOS renders inline, so it needs its own sheet and a Done button.
  function onChange(_: unknown, picked?: Date) {
    if (Platform.OS === "android") {
      setPicking(false);
      if (picked) onPickDate(picked);
      return;
    }
    if (picked) setDraft(picked);
  }

  return (
    <View style={styles.navWrap}>
      {/* A calendar rather than arrows: stepping one period at a time is fine
          for last month and hopeless for last March. The label is the control,
          and the grain below decides whether a chosen date means that day, its
          week, its month or its year. */}
      <View style={styles.picker}>
        <View style={styles.navLabelWrap}>
          <Text style={styles.navLabel} numberOfLines={1}>
            {w.label}
            {w.isCurrent ? <Text style={styles.navSub}>  SO FAR</Text> : null}
          </Text>
          <Text style={styles.navHint} numberOfLines={1}>
            Tap the calendar to jump to any date
          </Text>
        </View>
        <Pressable
          onPress={open}
          accessibilityLabel="Choose a date"
          hitSlop={8}
          style={({ pressed }) => [styles.calBtn, pressed && styles.pressed]}
        >
          <Ionicons name="calendar-outline" size={19} color={C.text} />
        </Pressable>
      </View>

      <View style={styles.grainRow}>
        {GRAINS.map((g) => {
          const on = g.key === w.grain;
          return (
            <Pressable
              key={g.key}
              onPress={() => onGrain(g.key)}
              style={({ pressed }) => [
                styles.grain,
                on && styles.grainOn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.grainText, on && styles.grainTextOn]}>
                {g.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {picking && Platform.OS === "android" ? (
        <DateTimePicker
          value={draft}
          mode="date"
          display="calendar"
          maximumDate={new Date()}
          onChange={onChange}
        />
      ) : null}

      {Platform.OS !== "android" ? (
        <Modal
          visible={picking}
          transparent
          animationType="fade"
          onRequestClose={() => setPicking(false)}
        >
          <Pressable
            style={styles.backdrop}
            onPress={() => setPicking(false)}
          >
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>Jump to a date</Text>
              {/* A real month grid, not the spinner. Scrolling three tumblers
                  to reach a date is the opposite of picking one, and iOS's
                  inline calendar lets you jump months and tap a day directly.
                  It needs explicit height — inside a modal it collapses to
                  nothing without one, which is what made the sheet look
                  empty the first time. */}
              <View style={styles.pickerWrap}>
                <DateTimePicker
                  value={draft}
                  mode="date"
                  display="inline"
                  themeVariant="dark"
                  maximumDate={new Date()}
                  onChange={onChange}
                  style={styles.picker3}
                />
              </View>
              <View style={styles.sheetActions}>
                {/* Getting back to the present shouldn't mean navigating the
                    grid back to it. */}
                <Pressable
                  onPress={() => {
                    setPicking(false);
                    onPickDate(new Date());
                  }}
                  style={({ pressed }) => [
                    styles.sheetBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.sheetBtnText}>Today</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPicking(false)}
                  style={({ pressed }) => [
                    styles.sheetBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.sheetBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setPicking(false);
                    onPickDate(draft);
                  }}
                  style={({ pressed }) => [
                    styles.sheetBtn,
                    styles.sheetBtnPrimary,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.sheetBtnTextPrimary}>Show it</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

// ── Highlights ────────────────────────────────────────────────────────────

export function Highlights({
  items,
  onPress,
}: {
  items: Highlight[];
  onPress?: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Highlights</Text>
      {items.map((h) => {
        const isIn = h.kind === "received";
        const d = new Date(h.at);
        return (
          <Pressable
            key={h.kind + h.id}
            onPress={() => onPress?.(h.id)}
            style={({ pressed }) => [styles.hl, pressed && styles.pressed]}
          >
            <View
              style={[
                styles.hlIcon,
                { backgroundColor: isIn ? C.greenBg : C.redBg },
              ]}
            >
              <Text style={{ color: isIn ? C.green : C.red, fontSize: 15 }}>
                {isIn ? "↓" : "↑"}
              </Text>
            </View>
            <View style={styles.hlBody}>
              <Text style={styles.hlLabel}>
                {isIn ? "BIGGEST RECEIVED" : "BIGGEST SPEND"}
              </Text>
              <Text style={styles.hlMerchant} numberOfLines={1}>
                {h.merchant}
              </Text>
              <Text style={styles.hlSub} numberOfLines={1}>
                {h.category} · {d.getDate()}{" "}
                {d.toLocaleString("en-IN", { month: "short" })}
              </Text>
            </View>
            <Text style={[styles.hlAmount, isIn && { color: C.green }]}>
              {isIn ? "+" : "−"} {inr(h.amount)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Calendar / week ───────────────────────────────────────────────────────

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function compact(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

/** Shade from "nothing" to "the month's worst day". */
function shade(ratio: number): string {
  if (ratio <= 0) return "transparent";
  if (ratio < 0.25) return "rgba(250,250,250,0.08)";
  if (ratio < 0.5) return "rgba(250,250,250,0.16)";
  if (ratio < 0.75) return "rgba(250,250,250,0.26)";
  return "rgba(250,250,250,0.38)";
}

/**
 * A month on one screen: each day carrying its spend, shaded by weight, with a
 * dot when money came in. Tapping a day narrows everything to it.
 */
export function CalendarMonth({
  monthStart,
  days,
  onPickDay,
}: {
  monthStart: Date;
  days: DayTotal[];
  onPickDay: (d: Date) => void;
}) {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const total = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const byKey = new Map(days.map((d) => [d.date, d]));
  const max = Math.max(1, ...days.map((d) => d.spent));

  const cells: Array<{ day: number; total: DayTotal | undefined } | null> = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let day = 1; day <= total; day++) {
    cells.push({ day, total: byKey.get(dateKey(new Date(year, month, day))) });
  }

  return (
    <View style={styles.card}>
      <View style={styles.calRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.calHead}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {cells.map((cell, i) => {
          if (!cell) return <View key={`pad${i}`} style={styles.cell} />;
          const t = cell.total;
          const spent = t?.spent ?? 0;
          const has = (t?.txCount ?? 0) > 0;
          const body = (
            <>
              <Text style={[styles.cellDay, !has && { color: C.subtle }]}>
                {cell.day}
              </Text>
              {spent > 0 ? (
                <Text style={styles.cellAmount} numberOfLines={1}>
                  {compact(spent)}
                </Text>
              ) : null}
              {(t?.received ?? 0) > 0 ? <View style={styles.inDot} /> : null}
            </>
          );
          return has ? (
            <Pressable
              key={cell.day}
              onPress={() => onPickDay(new Date(year, month, cell.day))}
              style={({ pressed }) => [
                styles.cell,
                { backgroundColor: shade(spent / max) },
                pressed && styles.pressed,
              ]}
            >
              {body}
            </Pressable>
          ) : (
            <View key={cell.day} style={styles.cell}>
              {body}
            </View>
          );
        })}
      </View>
      <Text style={styles.calHint}>
        Darker means a heavier day · green dot means money in · tap a day
      </Text>
    </View>
  );
}

/** The seven days of a week as bars, with the same tap-to-narrow. */
export function WeekStrip({
  weekStart,
  days,
  onPickDay,
}: {
  weekStart: Date;
  days: DayTotal[];
  onPickDay: (d: Date) => void;
}) {
  const byKey = new Map(days.map((d) => [d.date, d]));
  const cells = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(
      weekStart.getFullYear(),
      weekStart.getMonth(),
      weekStart.getDate() + i
    );
    return { d, t: byKey.get(dateKey(d)) };
  });
  const max = Math.max(1, ...cells.map((c) => c.t?.spent ?? 0));

  return (
    <View style={styles.card}>
      <View style={styles.calGrid}>
        {cells.map(({ d, t }, i) => {
          const spent = t?.spent ?? 0;
          const has = (t?.txCount ?? 0) > 0;
          const h = spent > 0 ? Math.max(6, (spent / max) * 44) : 3;
          const body = (
            <>
              <Text style={styles.calHead}>{WEEKDAYS[i]}</Text>
              <Text style={[styles.cellDay, !has && { color: C.subtle }]}>
                {d.getDate()}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height: h, backgroundColor: has ? C.text : C.border },
                  ]}
                />
              </View>
              <Text style={styles.cellAmount} numberOfLines={1}>
                {spent > 0 ? compact(spent) : "—"}
              </Text>
            </>
          );
          return has ? (
            <Pressable
              key={i}
              onPress={() => onPickDay(d)}
              style={({ pressed }) => [styles.weekCell, pressed && styles.pressed]}
            >
              {body}
            </Pressable>
          ) : (
            <View key={i} style={[styles.weekCell, { opacity: 0.5 }]}>
              {body}
            </View>
          );
        })}
      </View>
      <Text style={styles.calHint}>Tap a day to see just that day</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },

  navWrap: { marginTop: 12, gap: 8 },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  calBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  navHint: { color: C.subtle, fontSize: 10, marginTop: 2 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  // A month grid wants ~320pt of width. On a 375pt phone, 20pt of backdrop
  // padding plus 28pt of sheet padding left only ~307 and squeezed it.
  sheet: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
  },
  sheetTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
  },
  // A month grid needs room for six rows of dates plus its own header.
  pickerWrap: { height: 340, width: "100%" },
  picker3: { flex: 1, width: "100%" },
  sheetActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  sheetBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetBtnPrimary: { backgroundColor: C.text, borderColor: C.text },
  sheetBtnText: { color: C.muted, fontSize: 14, fontWeight: "600" },
  sheetBtnTextPrimary: { color: C.bg, fontSize: 14, fontWeight: "700" },
  navLabelWrap: { flex: 1, minWidth: 0 },
  navLabel: { color: C.text, fontSize: 15, fontWeight: "700" },
  navSub: { color: C.subtle, fontSize: 10, letterSpacing: 0.6, fontWeight: "600" },

  grainRow: { flexDirection: "row", gap: 6 },
  grain: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  grainOn: { backgroundColor: C.text, borderColor: C.text },
  grainText: { color: C.muted, fontSize: 13, fontWeight: "600" },
  grainTextOn: { color: C.bg },

  section: { marginTop: 14 },
  sectionTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  hl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 8,
  },
  hlIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  hlBody: { flex: 1, minWidth: 0 },
  hlLabel: { color: C.subtle, fontSize: 10, letterSpacing: 0.6 },
  hlMerchant: { color: C.text, fontSize: 14, fontWeight: "600", marginTop: 1 },
  hlSub: { color: C.subtle, fontSize: 11, marginTop: 1 },
  hlAmount: { color: C.text, fontSize: 14, fontWeight: "700" },

  card: {
    marginTop: 12,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
  },
  calRow: { flexDirection: "row", marginBottom: 4 },
  calHead: {
    flex: 1,
    textAlign: "center",
    color: C.subtle,
    fontSize: 10,
    fontWeight: "600",
  },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingVertical: 3,
  },
  weekCell: {
    width: `${100 / 7}%`,
    minHeight: 44,
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 3,
  },
  cellDay: { color: C.muted, fontSize: 11 },
  cellAmount: { color: C.text, fontSize: 9, marginTop: 1 },
  inDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.green,
    marginTop: 2,
  },
  barTrack: { height: 46, width: "70%", justifyContent: "flex-end", marginTop: 3 },
  bar: { width: "100%", borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  calHint: {
    color: C.subtle,
    fontSize: 10,
    textAlign: "center",
    marginTop: 8,
  },
});
