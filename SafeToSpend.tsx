import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { C, MONO } from "./theme";
import { inr } from "./format";
import type { Dashboard } from "./api";
import { useReduceMotion } from "./useReduceMotion";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Budget = NonNullable<Dashboard["budget"]>;

export type SafeState = {
  /** What can go out today and still land on the cap. Never below zero. */
  daily: number;
  /** How far past the cap, once it has been passed. */
  over: number;
  /** Share of the cap used, 0–1. */
  used: number;
  tone: "ok" | "tight" | "over";
};

/**
 * The cap spread over the days left, today included — so on the last day the
 * whole remainder is today's, and on the first it is a 30th of the month.
 *
 * "Tight" is when a day's share has fallen under a fifth of what an even split
 * of the cap would allow: still under budget, but only just.
 */
export function safeToSpend(budget: Budget, spent: number): SafeState {
  const daysLeft = Math.max(1, budget.daysInMonth - budget.daysElapsed + 1);
  const left = budget.cap - spent;
  const daily = Math.max(0, left / daysLeft);
  const even = budget.cap / budget.daysInMonth;
  const tone = left < 0 ? "over" : daily < even * 0.2 ? "tight" : "ok";
  return {
    daily,
    over: Math.max(0, -left),
    used: budget.cap > 0 ? Math.min(1, Math.max(0, spent / budget.cap)) : 0,
    tone,
  };
}

/**
 * What was spent against the cap. Caps can cover only some categories, so the
 * month's whole spend is not the right number; the server's own figure is, when
 * it sends one. Without it, `left` gives it back until it is clamped at zero.
 */
export function budgetSpent(budget: Budget, monthSpent: number): number {
  if (typeof budget.spent === "number") return budget.spent;
  if (budget.left > 0) return budget.cap - budget.left;
  return Math.max(budget.cap, monthSpent);
}

const TONE_COLOR = { ok: C.highlight, tight: C.amber, over: C.red } as const;

/** Share-of-cap ring with the percentage inside. Fills on change. */
function Ring({ used, color, size = 92, stroke = 9 }: { used: number; color: string; size?: number; stroke?: number }) {
  const reduce = useReduceMotion();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(v, {
      toValue: used,
      duration: reduce ? 0 : 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [used, reduce, v]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.glassEdge} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={v.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] })}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringLabel]}>
        <Text style={styles.ringPct}>{Math.round(used * 100)}%</Text>
        <Text style={styles.ringSub}>used</Text>
      </View>
    </View>
  );
}

export function SafeToSpendHero({
  budget,
  spent,
  monthLabel,
  children,
}: {
  budget: Budget;
  /** The whole month's spending, shown as the secondary line. */
  spent: number;
  monthLabel: string;
  /** The month-over-month pill, carried over from the old hero. */
  children?: React.ReactNode;
}) {
  const s = safeToSpend(budget, budgetSpent(budget, spent));
  const color = TONE_COLOR[s.tone];

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{s.tone === "over" ? "Over budget" : "Safe to spend today"}</Text>
        <Text
          style={[styles.amount, s.tone !== "ok" && { color }]}
          adjustsFontSizeToFit
          numberOfLines={1}
          accessibilityLabel={
            s.tone === "over" ? `${inr(s.over)} over budget` : `${inr(s.daily)} safe to spend today`
          }
        >
          {s.tone === "over" ? `${inr(s.over)} over` : inr(Math.floor(s.daily))}
        </Text>
        <Text style={styles.secondary}>
          Spent {inr(spent)} in {monthLabel}
        </Text>
        <Text style={styles.secondary}>
          {inr(budget.cap)} budget · day {budget.daysElapsed} of {budget.daysInMonth}
        </Text>
        {children ? <View style={styles.extra}>{children}</View> : null}
      </View>
      <Ring used={s.used} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  label: { fontSize: 13, color: C.muted, marginBottom: 4 },
  amount: {
    fontFamily: MONO,
    fontSize: 38,
    fontWeight: "600",
    color: C.text,
    letterSpacing: -1,
  },
  secondary: { fontSize: 13, color: C.muted, marginTop: 4 },
  extra: { flexDirection: "row", marginTop: 10 },
  ringLabel: { alignItems: "center", justifyContent: "center" },
  ringPct: { fontFamily: MONO, fontSize: 17, color: C.text, fontWeight: "600" },
  ringSub: { fontSize: 10, color: C.muted, marginTop: 1 },
});
