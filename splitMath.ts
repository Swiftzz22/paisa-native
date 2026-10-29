import type { SplitMode, SplitPlan } from "./api";

/**
 * The phone's half of bill splitting: a live preview while someone types.
 *
 * The server divides the bill for real (it alone knows a foreign receipt's
 * exact rupee total), so this only has to agree with it — and it does, using
 * the same largest-remainder method: everyone gets the floor of their exact
 * share, and the paise left over go to whoever lost most to rounding.
 */
export function allocate(total: number, weights: number[]): number[] {
  const paise = Math.round(total * 100);
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || paise <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (paise * w) / sum);
  const floors = exact.map(Math.floor);
  let left = paise - floors.reduce((s, f) => s + f, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]++;
    left--;
  }
  return floors.map((p) => p / 100);
}

/** Why a split can't be saved yet, in words for the screen; null when it can. */
export function splitProblem(plan: SplitPlan, bill: number): string | null {
  const ws = plan.entries.map((e) => e.weight);
  const others = plan.entries.filter((e) => e.personId !== null);
  if (others.length === 0) return "Add at least one person to split with.";
  if (plan.paidBy && !plan.entries.some((e) => e.personId === plan.paidBy)) {
    return "Whoever paid has to be in the split.";
  }
  const sum = ws.reduce((s, w) => s + w, 0);
  if (sum <= 0) return "Give someone a share.";
  if (plan.mode === "exact" || plan.mode === "items") {
    const diff = Math.round((bill - sum) * 100) / 100;
    if (Math.abs(diff) >= 0.01) {
      return diff > 0
        ? `${diff.toFixed(2)} still to assign.`
        : `${Math.abs(diff).toFixed(2)} more than the bill.`;
    }
  }
  if (plan.mode === "percent" && Math.abs(sum - 100) >= 0.01) {
    return `Percentages add up to ${Math.round(sum * 100) / 100}%, not 100%.`;
  }
  return null;
}

export type ItemAssignment = {
  name: string;
  amount: number;
  /** Who had it. Empty = everyone in the split shares it. */
  people: (string | null)[];
};

/**
 * Turn "who had what" off a receipt into what each person owes, in the
 * bill's currency.
 *
 * Each item is shared equally by whoever had it. Tax, service charge, tip and
 * discounts aren't anyone's in particular, so they are spread in proportion
 * to what each person ordered — someone who had a coffee doesn't pay a third
 * of the service charge on the steaks. Whatever is left between the items and
 * the bill (rounding on the receipt, or an extra the reader missed) is spread
 * the same way, so the result always lands exactly on the bill.
 */
export function itemsToWeights(
  members: (string | null)[],
  items: ItemAssignment[],
  bill: number
): Map<string | null, number> {
  const subtotal = new Map<string | null, number>(members.map((m) => [m, 0]));
  for (const it of items) {
    const who = it.people.length ? it.people.filter((p) => subtotal.has(p)) : members;
    if (!who.length || it.amount <= 0) continue;
    const parts = allocate(it.amount, who.map(() => 1));
    who.forEach((p, i) => subtotal.set(p, (subtotal.get(p) ?? 0) + parts[i]));
  }
  const itemsSum = [...subtotal.values()].reduce((s, v) => s + v, 0);
  if (itemsSum <= 0) {
    // Nothing assigned yet: an even split is the honest default.
    const even = allocate(bill, members.map(() => 1));
    return new Map(members.map((m, i) => [m, even[i]]));
  }
  // Scale everyone's subtotal up (or down) to the bill: that is "extras in
  // proportion", done in one step and exact to the paisa.
  const scaled = allocate(bill, members.map((m) => subtotal.get(m) ?? 0));
  return new Map(members.map((m, i) => [m, scaled[i]]));
}

export const MODE_LABELS: Record<SplitMode, string> = {
  equal: "Equally",
  exact: "Amounts",
  percent: "%",
  shares: "Shares",
  items: "By item",
};
