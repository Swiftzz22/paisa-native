// Run with: npx tsx upiQr.test.ts
import assert from "node:assert/strict";
import { categoryFromMcc, parsePaymentQr } from "./upiQr";

/** Build an EMV field: ID, two-digit length, value. */
const f = (id: string, v: string) => `${id}${String(v.length).padStart(2, "0")}${v}`;

const cases: [string, string, Partial<ReturnType<typeof parsePaymentQr>> | null][] = [
  [
    "dynamic UPI with amount",
    "upi://pay?pa=swiggy@icici&pn=Swiggy&am=249.00&cu=INR&mc=5812&tn=Order%201234",
    { upiId: "swiggy@icici", name: "Swiggy", amount: 249, mcc: "5812", note: "Order 1234" },
  ],
  [
    "static shop sticker, plus-encoded name, upper-case scheme",
    "UPI://pay?pa=Q123456789@ybl&pn=SHARMA+TEA+STALL&mc=5814",
    { upiId: "q123456789@ybl", name: "Sharma Tea Stall", amount: null, mcc: "5814" },
  ],
  [
    "person-to-person, no name",
    "upi://pay?pa=riya.k@okaxis",
    { upiId: "riya.k@okaxis", name: null, amount: null, mcc: null },
  ],
  ["not a UPI ID", "upi://pay?pa=hello&pn=X", null],
  ["a website", "https://example.com/menu", null],
  ["a product barcode", "8901058000290", null],
  [
    "BharatQR with UPI inside",
    "000201" +
      "010212" +
      f("26", f("00", "com.npci") + f("01", "BLINKIT@hdfcbank")) +
      f("52", "5411") +
      f("53", "356") +
      f("54", "612.50") +
      f("58", "IN") +
      f("59", "BLINKIT") +
      f("60", "GURGAON") +
      "6304ABCD",
    { upiId: "blinkit@hdfcbank", name: "Blinkit", amount: 612.5, mcc: "5411" },
  ],
  [
    "BharatQR in another currency drops the amount",
    "000201" + f("26", f("01", "shop@upi")) + f("53", "840") + f("54", "10.00") + f("59", "Duty Free"),
    { upiId: "shop@upi", name: "Duty Free", amount: null },
  ],
];

for (const [label, input, want] of cases) {
  const got = parsePaymentQr(input);
  if (want === null) assert.equal(got, null, label);
  else {
    assert.ok(got, label);
    for (const [k, v] of Object.entries(want)) {
      assert.deepEqual((got as Record<string, unknown>)[k], v, `${label}: ${k}`);
    }
  }
  console.log("ok  ", label);
}

const cats = [
  { id: "food", label: "Food" },
  { id: "rest", label: "Food › Restaurants" },
  { id: "gro", label: "Groceries" },
  { id: "tr", label: "Transport" },
  { id: "hl", label: "Health" },
];
assert.equal(categoryFromMcc("5812", cats), "food");
assert.equal(categoryFromMcc("5411", cats), "gro");
assert.equal(categoryFromMcc("4121", cats), "tr");
assert.equal(categoryFromMcc("5912", cats), "hl");
assert.equal(categoryFromMcc("7832", cats), null); // no entertainment category
assert.equal(categoryFromMcc(null, cats), null);
console.log("ok   merchant category codes map to their own categories");
console.log(`\nall ${cases.length + 1} checks pass`);
