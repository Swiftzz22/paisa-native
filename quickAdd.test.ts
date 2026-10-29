// Run with: npx tsx quickAdd.test.ts
import assert from "node:assert/strict";
import { occurredAtFor, parseQuickAdd } from "./quickAdd";

const ctx = {
  modes: [
    { value: "upi", label: "UPI" },
    { value: "card", label: "Card" },
    { value: "cash", label: "Cash" },
    { value: "netbanking", label: "Net banking" },
  ],
  categories: [
    { id: "food", label: "Food & Dining" },
    { id: "groceries", label: "Groceries" },
    { id: "transport", label: "Transport" },
    { id: "subs", label: "Subscriptions" },
  ],
  history: [
    { merchant: "Zomato", categoryId: "food" },
    { merchant: "Uber", categoryId: "transport" },
    { merchant: "DMart", categoryId: "groceries" },
  ],
};

type Want = Partial<ReturnType<typeof parseQuickAdd>>;
const cases: [string, Want][] = [
  ["412 zomato upi", { amount: 412, merchant: "Zomato", paymentMode: "upi", categoryId: "food", categoryFrom: "history" }],
  ["₹1,200 dmart card yesterday", { amount: 1200, merchant: "DMart", paymentMode: "card", day: "yesterday", categoryId: "groceries" }],
  ["1.2k dinner with riya", { amount: 1200, merchant: "Dinner", withName: "Riya", paymentMode: null, categoryId: null }],
  ["uber 186 gpay", { amount: 186, merchant: "Uber", paymentMode: "upi", categoryId: "transport" }],
  ["rs 649 netflix subscriptions card", { amount: 649, merchant: "Netflix", paymentMode: "card", categoryId: "subs", categoryFrom: "name" }],
  ["chai 20 cash today", { amount: 20, merchant: "Chai", paymentMode: "cash", day: "today" }],
  ["paid 2.5k for rent via phonepe", { amount: 2500, merchant: "Rent", paymentMode: "upi" }],
  ["450 groceries", { amount: 450, merchant: "Groceries", categoryId: "groceries", categoryFrom: "name" }],
  ["auto to college 80 paytm", { amount: 80, merchant: "Auto To College", paymentMode: "upi" }],
  ["ZOMATO 99", { amount: 99, merchant: "Zomato", categoryId: "food" }],
  ["swiggy", { amount: null, merchant: "Swiggy", paymentMode: null }],
  ["1.5L laptop credit card", { amount: 150000, merchant: "Laptop", paymentMode: "card" }],
];

let failed = 0;
for (const [text, want] of cases) {
  const got = parseQuickAdd(text, ctx);
  try {
    for (const [k, v] of Object.entries(want)) {
      assert.deepEqual(got[k as keyof typeof got], v, `${k}`);
    }
    console.log(`ok   ${JSON.stringify(text)}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${JSON.stringify(text)}: ${(e as Error).message}\n     got ${JSON.stringify(got)}`);
  }
}

assert.equal(occurredAtFor("today"), undefined);
assert.equal(occurredAtFor(null), undefined);
const y = occurredAtFor("yesterday", new Date("2026-10-29T10:00:00Z"));
assert.equal(y, "2026-10-28T10:00:00.000Z");
console.log(failed ? `\n${failed} failed` : `\nall ${cases.length} phrases pass`);
process.exit(failed ? 1 : 0);
