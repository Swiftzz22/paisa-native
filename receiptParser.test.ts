// Run with: npx tsx receiptParser.test.ts
import assert from "node:assert/strict";
import { parseReceipt } from "./receiptParser";

const today = new Date("2026-11-04T10:00:00Z");

/** The same receipt as an OCR that dropped every accent would return it. */
const noAccents = (lines: string[]) =>
  lines.map((l) => l.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D"));

// Two real receipts from Hanoi, 19 Oct 2026, as Vision returns them once rows
// are rebuilt. Both write the dong as the letter "đ", and neither names the
// country, which is how they were once logged as rupees with the wrong total.
const uniqlo = [
  "UNIQLO", "WWW.UNIQLO.COM", "UNIQLO AEON MALL Long Biên",
  "Tầng 1, Số 27, Đ. Cổ Linh, Long Biên, Hà Nội", "ĐT: 024 7123 9906", "** Biên lai **",
  "Mã CQT M1-26-LS3V6-00651292072", "19/10/2026 [16:30]",
  "W AO BRA đ391.000 T", "2000221107005 1",
  "Tổng số lượng bán ra 1 đ391.000", "Subtotal đ391.000", "TỔNG đ391.000",
  "Phương thức thanh toán đ501.000", "Tiền mặt", "Tiền thối đ110.000",
  "Thuế bao gồm (VAT): đ28.963", "8,00% của đ391.000",
];
const nike = [
  "360 NIKE AEON MALL LONG BIEN", "T1-39, Tầng 1, TTTM Aeon Mall Long Biên 27 Cổ Linh,",
  "Phường Long Biên, Hà Nội", "Điện thoại 02473011399", "PHIẾU THU",
  "Ngày mua: Oct 19, 26 4:16 PM", "Số phiếu thu: 70198",
  "300000000005 GWPNIK TÚI GIẤY (Hàng tặng không thu tiền) (1 x 0 @0%) 0 đ",
  "198959505834 NIKE GIÀY CHẠY BỘ THỂ THAO (1 x 4550000 @0%) 4,550,000 đ",
  "Tổng số lượng 2", "Tổng cộng trước giảm giá 4,550,000 đ", "Tổng giảm giá 84,175 đ",
  "Giảm giá trên hóa đơn 84,175 đ", "Số tiền phải thanh toán 4,465,825 đ",
  "Thẻ tín dụng Visa 4,465,825 đ", "Tổng tiền hóa đơn 4,465,825 đ",
];
// Label and price came back as separate lines.
const uniqloSplit = [
  "UNIQLO", "19/10/2026", "W AO BRA", "đ391.000", "Subtotal", "đ391.000",
  "TỔNG", "đ391.000", "Tiền mặt", "đ501.000", "Tiền thối", "đ110.000",
];

const cases: [string, string[], { total: number; currency: string; date: string }][] = [
  // Not the ₫501,000 cash handed over, nor the ₫110,000 change.
  ["Uniqlo Hanoi", uniqlo, { total: 391000, currency: "VND", date: "2026-10-19" }],
  // Not the ₫4,550,000 before the discount.
  ["Nike Hanoi", nike, { total: 4465825, currency: "VND", date: "2026-10-19" }],
  ["Uniqlo, no accents", noAccents(uniqlo), { total: 391000, currency: "VND", date: "2026-10-19" }],
  ["Nike, no accents", noAccents(nike), { total: 4465825, currency: "VND", date: "2026-10-19" }],
  ["Uniqlo, split lines", uniqloSplit, { total: 391000, currency: "VND", date: "2026-10-19" }],
  [
    "India stays INR",
    ["CHAAYOS", "GSTIN 07AABCU9603R1ZX", "28/10/2026", "Masala Chai 180.00", "CGST 4.50", "SGST 4.50", "Grand Total 189.00"],
    { total: 189, currency: "INR", date: "2026-10-28" },
  ],
  [
    "Singapore stays SGD",
    ["YA KUN KAYA TOAST", "Date: 14/10/2026 09:12", "2 x Kaya Toast Set 11.80", "Kopi 1.90", "Subtotal 13.70", "GST 9% 1.23", "TOTAL S$14.93"],
    { total: 14.93, currency: "SGD", date: "2026-10-14" },
  ],
];

for (const [label, lines, want] of cases) {
  const r = parseReceipt(lines, { today });
  assert.equal(r.total, want.total, `${label}: total`);
  assert.equal(r.currency, want.currency, `${label}: currency`);
  assert.equal(r.date, want.date, `${label}: date`);
  console.log("ok  ", label);
}
console.log(`\nall ${cases.length} receipts pass`);
