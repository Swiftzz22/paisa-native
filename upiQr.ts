/**
 * Read a payment QR: who is being paid, how much, and what kind of shop.
 *
 * Two shapes cover what Indian counters show:
 *  - UPI links, `upi://pay?pa=swiggy@icici&pn=Swiggy&am=249.00&mc=5812`, from
 *    Paytm, PhonePe, GPay and bank stickers.
 *  - BharatQR, the EMV format some card-and-UPI stickers use: numbered
 *    fields (59 name, 54 amount, 52 category code) with the UPI ID inside one
 *    of the account fields.
 *
 * Pure: no camera, no network, so it can be tested anywhere.
 */

export type PaymentQr = {
  /** The payee's UPI ID, lowercased, when the code has one. */
  upiId: string | null;
  /** Who it's paid to, as a person would say it. Null when the code only has an ID. */
  name: string | null;
  /** In rupees, when the code fixes the amount (a bill, a dynamic QR). */
  amount: number | null;
  /** ISO 18245 merchant category code: what kind of shop. */
  mcc: string | null;
  /** The payee's own note on the code, e.g. "Order 1234". */
  note: string | null;
};

const UPI_ID = /^[a-z0-9._-]{2,256}@[a-z0-9.-]{2,64}$/i;

export function parsePaymentQr(raw: string): PaymentQr | null {
  const data = raw.trim();
  if (/^upi:\/\//i.test(data)) return fromUpiLink(data);
  if (/^000201/.test(data)) return fromEmv(data);
  return null;
}

function fromUpiLink(data: string): PaymentQr | null {
  const q = data.indexOf("?");
  if (q < 0) return null;
  const params = new Map<string, string>();
  for (const part of data.slice(q + 1).split("&")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).toLowerCase();
    let value = part.slice(eq + 1).replace(/\+/g, " ");
    try {
      value = decodeURIComponent(value);
    } catch {
      // A stray "%" in a shop name; keep it as printed.
    }
    if (!params.has(key)) params.set(key, value.trim());
  }
  const upiId = params.get("pa")?.toLowerCase() ?? null;
  if (!upiId || !UPI_ID.test(upiId)) return null;
  // Codes in other currencies exist in theory; a rupee amount is the only kind
  // this can log.
  const cu = params.get("cu");
  return {
    upiId,
    name: cleanName(params.get("pn")),
    amount: cu && cu.toUpperCase() !== "INR" ? null : money(params.get("am")),
    mcc: digits4(params.get("mc")),
    note: params.get("tn") || null,
  };
}

/** EMV merchant-presented QR: ID (2 digits), length (2 digits), value. */
function tlv(s: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i + 4 <= s.length) {
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isFinite(len)) break;
    out.set(id, s.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return out;
}

function fromEmv(data: string): PaymentQr | null {
  const top = tlv(data);
  // Merchant account fields are IDs 02–51; UPI ones carry the ID nested inside.
  let upiId: string | null = null;
  for (let id = 2; id <= 51 && !upiId; id++) {
    const field = top.get(String(id).padStart(2, "0"));
    if (!field) continue;
    for (const v of tlv(field).values()) {
      if (UPI_ID.test(v)) {
        upiId = v.toLowerCase();
        break;
      }
    }
  }
  const name = cleanName(top.get("59"));
  if (!upiId && !name) return null;
  // 53 is the currency as an ISO 4217 number; 356 is the rupee.
  const currency = top.get("53");
  return {
    upiId,
    name,
    amount: currency && currency !== "356" ? null : money(top.get("54")),
    mcc: digits4(top.get("52")),
    note: null,
  };
}

function money(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 && n < 100_000_000 ? Math.round(n * 100) / 100 : null;
}

function digits4(v: string | undefined): string | null {
  return v && /^\d{4}$/.test(v) && v !== "0000" ? v : null;
}

/** "SWIGGY  LIMITED" → "Swiggy Limited"; a name that is just the UPI ID is no name. */
function cleanName(v: string | undefined): string | null {
  const s = v?.replace(/\s+/g, " ").trim();
  if (!s || UPI_ID.test(s)) return null;
  return s === s.toUpperCase()
    ? s.toLowerCase().replace(/(^|[\s.&-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
    : s;
}

/**
 * What a merchant category code says about the shop, as words that tend to
 * appear in category names ("food", "transport"…). Matched against the
 * person's own categories, so nothing here assumes how they've named theirs.
 */
const MCC_HINTS: [RegExp, string[]][] = [
  [/^58(1[2-4])$/, ["food", "restaurant", "dining", "eating"]],
  [/^(5411|5422|5441|5451|5462|5499)$/, ["grocer", "food"]],
  [/^(4111|4112|4121|4131|4789|7512|7523)$/, ["transport", "travel", "cab"]],
  [/^(5541|5542|5983)$/, ["fuel", "petrol", "transport"]],
  [/^(5912|8011|8021|8031|8041|8042|8043|8049|8050|8062|8071|8099)$/, ["health", "medical", "pharmacy"]],
  [/^(4812|4814|4899|4900)$/, ["bill", "utilit", "recharge", "phone"]],
  [/^(53\d\d|56\d\d|5732|5944|5945|5977|5999)$/, ["shop", "clothing", "apparel"]],
  [/^(7832|7922|7991|7993|7996|7999)$/, ["entertain", "movie", "fun"]],
  [/^(3\d{3}|4511|4722|7011)$/, ["travel", "trip", "hotel"]],
  [/^(8211|8220|8241|8244|8249|8299|5942)$/, ["education", "study", "books"]],
  [/^(7230|7298)$/, ["salon", "personal", "beauty"]],
  [/^(6513)$/, ["rent", "housing"]],
];

export function categoryFromMcc(
  mcc: string | null,
  categories: { id: string; label: string }[]
): string | null {
  if (!mcc) return null;
  const words = MCC_HINTS.find(([re]) => re.test(mcc))?.[1];
  if (!words) return null;
  const labels = categories.map((c) => ({ id: c.id, label: c.label.toLowerCase() }));
  for (const w of words) {
    // A top-level category beats a subcategory that merely mentions the word.
    const hit =
      labels.find((c) => !c.label.includes("›") && c.label.includes(w)) ??
      labels.find((c) => c.label.includes(w));
    if (hit) return hit.id;
  }
  return null;
}
