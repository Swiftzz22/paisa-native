/**
 * Turn the lines of text read off a receipt into something a transaction can
 * be prefilled from.
 *
 * Rules only — no model, no network, no cost. It runs on whatever the phone's
 * text recognition returns, which for a receipt is usually a list of lines in
 * reading order, with one complication: a label and its price often come back
 * as separate lines ("TOTAL" then "450.00"), because the two columns are far
 * apart on the paper. Everything here allows for that.
 *
 * It never has to be perfect. The result prefills an editable form, and every
 * field says how sure it is so the screen can point at what to check.
 */

export type ReceiptItem = { name: string; amount: number; qty?: number };

export type ParsedReceipt = {
  merchant: string | null;
  /** YYYY-MM-DD. Null when no plausible date was found. */
  date: string | null;
  total: number | null;
  currency: string | null;
  /** False when the currency was guessed from an ambiguous mark like "$". */
  currencySure: boolean;
  items: ReceiptItem[];
  /** Added on top of the items: GST, VAT, service charge, tip. */
  extras: { label: string; amount: number }[];
  /** Rough 0–1. Below ~0.5 the AI fallback is worth offering. */
  confidence: number;
};

export type ParseHints = {
  /** Last foreign currency used — the best tie-breaker for "$" or "¥". */
  recentCurrency?: string | null;
  /** For rejecting future dates; injectable for tests. */
  today?: Date;
};

// ─── Amounts ────────────────────────────────────────────────────────────────

/**
 * A money-shaped number: 450 · 450.00 · 1,234.56 · 1.234,56 · 1,00,000.
 *
 * A plain space is deliberately not a thousands separator, though some
 * European receipts use one: "Butter Chicken 1 450.00" is a quantity and a
 * price, and reading it as ₹1,450 is the worse mistake. Only the non-breaking
 * and narrow spaces that typesetting uses for grouping count.
 */
const AMOUNT_RE =
  /-?\d{1,3}(?:[,.  ]\d{2,3})+(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/g;

/**
 * Read one money-shaped token as a number, working out which mark is the
 * decimal point. When both appear the last one is. When only one appears,
 * exactly three digits after it means thousands (1,500 · 1.500), which is
 * right for rupiah and yen and almost never wrong elsewhere.
 */
export function parseAmount(token: string): number | null {
  let t = token.replace(/[\s ]/g, "");
  const neg = t.startsWith("-");
  if (neg) t = t.slice(1);
  const lastDot = t.lastIndexOf(".");
  const lastComma = t.lastIndexOf(",");
  let decimalAt = -1;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalAt = Math.max(lastDot, lastComma);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const at = Math.max(lastDot, lastComma);
    const mark = t[at];
    const after = t.length - at - 1;
    const repeated = t.indexOf(mark) !== at;
    if (!repeated && after !== 3) decimalAt = at;
  }
  const whole = (decimalAt >= 0 ? t.slice(0, decimalAt) : t).replace(/[.,]/g, "");
  const frac = decimalAt >= 0 ? t.slice(decimalAt + 1) : "";
  const n = Number(frac ? `${whole}.${frac}` : whole);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Every amount on a line, skipping things that only look like numbers. */
function amountsIn(line: string): number[] {
  const cleaned = line
    // Dates, times, phone numbers and long ids are not prices.
    .replace(/\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/gi, " ")
    .replace(/\b\d{7,}\b/g, " ")
    // "3 ITEMS", "QTY 2", "x2", "2 x" are counts, not prices.
    .replace(/\b\d+\s*(?:items?|qty|pcs|nos)\b|\b(?:qty|items?)\s*:?\s*\d+\b/gi, " ")
    .replace(/(?:^|\s)[x×]\s*\d{1,3}\b|\b\d{1,3}\s*[x×@](?=\s|$)/gi, " ")
    .replace(/\d{4}年\d{1,2}月\d{1,2}日/g, " ")
    .replace(/%/g, " % ");
  const out: number[] = [];
  for (const m of cleaned.matchAll(AMOUNT_RE)) {
    // "18 %" is a rate, not money.
    const rest = cleaned.slice((m.index ?? 0) + m[0].length);
    if (/^\s*%/.test(rest)) continue;
    const n = parseAmount(m[0]);
    if (n !== null) out.push(n);
  }
  return out;
}

/** The amount a line ends with — on a receipt, the price sits at the right. */
function trailingAmount(line: string): number | null {
  const all = amountsIn(line);
  return all.length ? all[all.length - 1] : null;
}

/** True for a line that is nothing but a price ("450.00", "₹ 1,299", "S$12.50"). */
function isAmountOnly(line: string): boolean {
  const stripped = line
    .replace(/(?:rs\.?|inr|usd|sgd|aed|eur|gbp|thb|myr|idr|jpy|us\$|s\$|hk\$|a\$|rm|rp)/gi, "")
    .replace(/[₹$€£¥฿₩₫₱:\s-]/g, "");
  return /^\d[\d.,]*$/.test(stripped) && amountsIn(line).length === 1;
}

// ─── Currency ───────────────────────────────────────────────────────────────

/** Unambiguous marks, checked before the bare "$" and "¥". */
const CURRENCY_MARKS: [RegExp, string][] = [
  [/₹|\brs\.?\s?\d|\binr\b/i, "INR"],
  [/\bs\$|\bsgd\b|singapore/i, "SGD"],
  [/\bhk\$|\bhkd\b|hong kong/i, "HKD"],
  [/\ba\$|\baud\b|australia/i, "AUD"],
  [/\bnz\$|\bnzd\b|new zealand/i, "NZD"],
  [/\bc\$|\bca\$|\bcad\b|canada/i, "CAD"],
  [/\bus\$|\busd\b/i, "USD"],
  [/€|\beur\b/i, "EUR"],
  [/£|\bgbp\b/i, "GBP"],
  [/฿|\bthb\b|\bbaht\b/i, "THB"],
  [/\brm\s?\d|\bmyr\b|malaysia/i, "MYR"],
  [/\brp\.?\s?\d|\bidr\b|indonesia/i, "IDR"],
  [/\baed\b|\bdhs?\b|dubai|abu dhabi|\buae\b/i, "AED"],
  [/\bsar\b|riyadh|jeddah/i, "SAR"],
  [/\bqar\b|doha/i, "QAR"],
  [/₩|\bkrw\b/i, "KRW"],
  [/₫|\bvnd\b|vietnam/i, "VND"],
  [/₱|\bphp\b|philippines/i, "PHP"],
  [/円|\bjpy\b|japan|tokyo|osaka/i, "JPY"],
  [/元|\bcny\b|\brmb\b/i, "CNY"],
  [/\blkr\b|sri lanka|colombo/i, "LKR"],
  [/\bnpr\b|nepal|kathmandu/i, "NPR"],
  [/\bmvr\b|maldives/i, "MVR"],
  [/\bchf\b|switzerland|zürich|zurich/i, "CHF"],
  [/\btry\b|₺|istanbul/i, "TRY"],
];

/** Indian tax words: a receipt that mentions GSTIN is in rupees whatever else it says. */
const INDIAN_TAX = /\bgstin\b|\bcgst\b|\bsgst\b|\bigst\b/i;

function detectCurrency(
  text: string,
  recent: string | null | undefined
): { currency: string | null; sure: boolean } {
  if (INDIAN_TAX.test(text)) return { currency: "INR", sure: true };
  // Count, rather than take the first hit — a Singapore receipt can mention
  // "USD accepted" once, but it says S$ on every line.
  const counts = new Map<string, number>();
  for (const [re, code] of CURRENCY_MARKS) {
    const n = (text.match(new RegExp(re.source, "gi")) ?? []).length;
    if (n) counts.set(code, (counts.get(code) ?? 0) + n);
  }
  if (counts.size) {
    const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return { currency: best[0], sure: true };
  }
  // A bare "$" or "¥": the currency used last is the best guess going, since
  // someone scanning a "$" receipt on a trip has usually scanned one before.
  const dollarish = new Set(["USD", "SGD", "HKD", "AUD", "NZD", "CAD", "TWD"]);
  if (/\$/.test(text)) {
    return { currency: recent && dollarish.has(recent) ? recent : "USD", sure: false };
  }
  if (/¥/.test(text)) {
    return { currency: recent === "CNY" ? "CNY" : "JPY", sure: false };
  }
  return { currency: null, sure: false };
}

// ─── Date ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function ymd(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // 31 Feb and friends
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function detectDate(lines: string[], currency: string | null, today: Date): string | null {
  // Day-first everywhere paisa's users shop, except receipts in US dollars.
  const monthFirst = currency === "USD";
  const latest = today.toISOString().slice(0, 10);
  const candidates: string[] = [];

  for (const line of lines) {
    for (const m of line.matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日/g)) {
      const v = ymd(+m[1], +m[2], +m[3]);
      if (v) candidates.push(v);
    }
    for (const m of line.matchAll(/\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/g)) {
      const v = ymd(+m[1], +m[2], +m[3]);
      if (v) candidates.push(v);
    }
    for (const m of line.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/g)) {
      const a = +m[1];
      const b = +m[2];
      const y = +m[3];
      // Whichever side is over 12 has to be the day.
      const dayFirst = a > 12 ? true : b > 12 ? false : !monthFirst;
      const v = dayFirst ? ymd(y, b, a) : ymd(y, a, b);
      if (v) candidates.push(v);
    }
    // 15 Jun 2025 · 15-Jun-25 · Jun 15, 2025
    for (const m of line.matchAll(/\b(\d{1,2})[\s-]*([a-z]{3})[a-z]*[\s,-]*(\d{2,4})\b/gi)) {
      const mo = MONTH_NAMES.indexOf(m[2].toLowerCase()) + 1;
      const v = mo ? ymd(+m[3], mo, +m[1]) : null;
      if (v) candidates.push(v);
    }
    for (const m of line.matchAll(/\b([a-z]{3})[a-z]*[\s.-]+(\d{1,2}),?[\s-]+(\d{2,4})\b/gi)) {
      const mo = MONTH_NAMES.indexOf(m[1].toLowerCase()) + 1;
      const v = mo ? ymd(+m[3], mo, +m[2]) : null;
      if (v) candidates.push(v);
    }
  }
  // A receipt from the future is a misread; one from years ago almost always is.
  const floor = new Date(today.getTime() - 400 * 86_400_000).toISOString().slice(0, 10);
  return candidates.find((c) => c <= latest && c >= floor) ?? null;
}

// ─── Merchant ───────────────────────────────────────────────────────────────

const NOT_A_NAME =
  /tax invoice|invoice|receipt|bill no|welcome|thank|gstin|fssai|\btel\b|phone|ph[:.]|mob|www\.|\.com|order|table|cashier|date|time|token|kot/i;
const ADDRESS =
  /\d.*\b(road|rd|street|st|lane|marg|nagar|sector|floor|building|bldg|avenue|ave|blvd|bd|block|plaza|rue|via|strasse|str|soi|jalan|jln)\b|\b\d{6}\b|#\d/i;

function detectMerchant(lines: string[]): string | null {
  for (const raw of lines.slice(0, 6)) {
    const line = raw.trim();
    if (line.length < 3 || line.length > 40) continue;
    if (NOT_A_NAME.test(line) || ADDRESS.test(line)) continue;
    const letters = line.replace(/[^A-Za-z]/g, "").length;
    if (letters < line.replace(/\s/g, "").length * 0.6) continue;
    // "STARBUCKS COFFEE" → "Starbucks Coffee", "JOE'S" → "Joe's",
    // "7-ELEVEN" → "7-Eleven"; leave mixed case alone.
    return line === line.toUpperCase()
      ? line.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase())
      : line;
  }
  return null;
}

// ─── Total, items, extras ───────────────────────────────────────────────────

/** Ranked: an explicit grand total beats a bare "total". */
const TOTAL_LABELS: [RegExp, number][] = [
  [/grand\s*total|total\s*payable|amount\s*payable|net\s*payable|amount\s*due|balance\s*due|total\s*due/i, 3],
  [/net\s*(?:amount|total)|total\s*amount|bill\s*amount|total\s*\(?(?:incl|inc)/i, 2],
  [/^\s*total\b|\btotal\s*[:₹$€£¥฿]|\btotal\s*$|合計|お会計|总计|합계/i, 1],
];
const NOT_TOTAL =
  /sub\s*-?\s*total|total\s*(?:tax|gst|vat|qty|quantity|items?|savings|discount)|tax\s*total|小計|小计/i;

const EXTRA_LABELS: [RegExp, string][] = [
  [/\bcgst\b/i, "CGST"],
  [/\bsgst\b|\butgst\b/i, "SGST"],
  [/\bigst\b/i, "IGST"],
  [/\bgst\b/i, "GST"],
  [/\bvat\b|\btva\b|\bmwst\b|\biva\b|消費税/i, "VAT"],
  [/service\s*(?:charge|chg|tax)|\bsvc\b|\bs\/c\b/i, "Service charge"],
  [/\btip\b|gratuity/i, "Tip"],
  [/\btax\b/i, "Tax"],
  [/round\s*(?:off|ing)/i, "Round off"],
  [/discount|\bdisc\b|savings/i, "Discount"],
];

/** Lines that are about paying, not about what was bought. */
const PAYMENT =
  /cash|change|tender|paid|card|visa|master|amex|upi|paytm|gpay|phonepe|balance|refund|approved|auth|ref\b|txn|terminal|rrn|\bmid\b|\btid\b/i;

/** The amount for a label line: on the same line, or alone on the next one. */
function amountFor(lines: string[], i: number): number | null {
  const own = trailingAmount(lines[i]);
  if (own !== null) return own;
  const next = lines[i + 1];
  return next !== undefined && isAmountOnly(next) ? trailingAmount(next) : null;
}

function detectTotal(lines: string[]): { total: number | null; at: number; rank: number } {
  let best = { total: null as number | null, at: -1, rank: 0 };
  lines.forEach((line, i) => {
    if (NOT_TOTAL.test(line)) return;
    for (const [re, rank] of TOTAL_LABELS) {
      if (!re.test(line)) continue;
      const amount = amountFor(lines, i);
      // Higher rank wins; at equal rank the later line wins, since a running
      // "total" above the tax is followed by the real one below it.
      if (amount !== null && amount > 0 && (rank > best.rank || (rank === best.rank && i > best.at))) {
        best = { total: amount, at: i, rank };
      }
      break;
    }
  });
  return best;
}

function detectExtras(lines: string[], end: number): { label: string; amount: number }[] {
  const out: { label: string; amount: number }[] = [];
  for (let i = 0; i < end; i++) {
    const line = lines[i];
    if (NOT_TOTAL.test(line) && !/tax|gst|vat/i.test(line)) continue;
    if (/total/i.test(line) && !/tax|gst|vat/i.test(line)) continue;
    for (const [re, label] of EXTRA_LABELS) {
      if (!re.test(line)) continue;
      const amount = amountFor(lines, i);
      if (amount !== null && amount !== 0) {
        out.push({ label, amount: label === "Discount" ? -Math.abs(amount) : amount });
      }
      break;
    }
  }
  return out;
}

/** Header furniture: everything above the first item is one of these. */
const HEADER_LINE =
  /tax invoice|invoice|receipt|\bbill\s*(?:no|#)|welcome|gstin|fssai|\btel\b|phone|\bph[:.]|\bmob|www\.|\.com\b|\border\s*(?:no|#|id)|\btable\b|cashier|server|\bdate\b|\btime\b|\btoken\b|\bkot\b|\bcovers?\b|\bpax\b|\bguests?\b|^\s*(?:item|description|particulars|qty|s\.?\s*no)\b/i;
const DATE_LIKE = /\b\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b|\b\d{1,2}:\d{2}\b/;

/** Index of the first line after the header block, searching above the total. */
function itemsStart(lines: string[], end: number): number {
  let start = 1; // line 0 is the name, at the very least
  for (let i = 0; i < end; i++) {
    const l = lines[i];
    if (HEADER_LINE.test(l) || ADDRESS.test(l) || DATE_LIKE.test(l)) start = i + 1;
  }
  return Math.min(start, end);
}

// "2 x Naan", "2x Café", and a bare leading count when a word follows: "2 Pancakes".
const QTY_PREFIX = /^(\d{1,2})(?:\s*(?:x|×|@|nos?\.?|pcs?)\s*|\s+)(?=\p{L})/iu;
// "Naan 2 x 90.00", "Kaya Toast Set x2".
const QTY_SUFFIX = /\s+(?:(\d{1,2})\s*(?:x|×|@)\s*[\d.,]+|(?:x|×)\s*(\d{1,2}))\s*$/i;

/**
 * Line items between the header and the total. Best-effort: they matter for
 * splitting a bill by item, and the person can always fix one by hand.
 */
function detectItems(lines: string[], start: number, end: number): ReceiptItem[] {
  const items: ReceiptItem[] = [];
  const isLabelish = (s: string) =>
    PAYMENT.test(s) ||
    NOT_TOTAL.test(s) ||
    EXTRA_LABELS.some(([re]) => re.test(s)) ||
    /total|qty|item|price|amount|rate|description|^\s*s\.?\s*no/i.test(s);

  for (let i = start; i < end; i++) {
    const line = lines[i].trim();
    if (!line || isLabelish(line)) continue;
    // Any script's letters: "おにぎり" and "चाय" are item names too.
    const letters = line.replace(/[^\p{L}]/gu, "");
    if (letters.length < 2) continue;

    let amount = trailingAmount(line);
    let name = line;
    if (amount !== null) {
      // Strip the price (and any unit-price column) off the end of the name.
      name = line.replace(/[\s₹$€£¥฿:]*-?[\d][\d.,\s]*$/, "").replace(/[\s₹$€£¥฿]+$/, "");
    } else if (i + 1 < end && isAmountOnly(lines[i + 1])) {
      // Name and price came back as separate lines.
      amount = trailingAmount(lines[i + 1]);
      i++;
    }
    if (amount === null || amount <= 0) continue;

    let qty: number | undefined;
    const pre = QTY_PREFIX.exec(name);
    if (pre) {
      qty = +pre[1];
      name = name.slice(pre[0].length);
    }
    const suf = QTY_SUFFIX.exec(name);
    if (suf) {
      qty = +(suf[1] ?? suf[2]);
      name = name.slice(0, suf.index);
    }
    name = name.replace(/\s{2,}/g, " ").trim();
    if (name.length < 2) continue;
    items.push(qty && qty > 1 ? { name, amount, qty } : { name, amount });
  }
  return items;
}

// ─── Putting it together ────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

export function parseReceipt(rawLines: string[], hints: ParseHints = {}): ParsedReceipt {
  const lines = rawLines
    .flatMap((l) => l.split(/\r?\n/))
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const text = lines.join("\n");
  const today = hints.today ?? new Date();

  const { currency, sure } = detectCurrency(text, hints.recentCurrency);
  const found = detectTotal(lines);
  const end = found.at >= 0 ? found.at : lines.length;
  const merchant = detectMerchant(lines);
  const items = detectItems(lines, itemsStart(lines, end), end);
  const extras = detectExtras(lines, end);
  const date = detectDate(lines, currency, today);
  const itemsSum = round2(items.reduce((s, it) => s + it.amount, 0));
  const extrasSum = round2(extras.reduce((s, e) => s + e.amount, 0));

  let total = found.total;
  let rank = found.rank;
  if (total === null) {
    // No labelled total. A scrappy bill is usually just its items added up;
    // failing that, the largest amount that isn't a payment line. Either way
    // the confidence score admits it was a guess.
    if (items.length > 0) {
      total = round2(itemsSum + extrasSum);
    } else {
      const amounts = lines
        .filter((l) => !PAYMENT.test(l))
        .flatMap(amountsIn)
        .filter((n) => n > 0);
      total = amounts.length ? Math.max(...amounts) : null;
    }
    rank = 0;
  }

  // Items plus extras landing on the labelled total is the strongest sign
  // every number was read correctly.
  const adds =
    found.total !== null && items.length > 0 && Math.abs(itemsSum + extrasSum - found.total) <= 1;

  let confidence = 0;
  if (total !== null) confidence += rank >= 2 ? 0.45 : rank === 1 ? 0.35 : 0.15;
  if (adds) confidence += 0.25;
  if (merchant) confidence += 0.1;
  if (date) confidence += 0.1;
  if (currency) confidence += sure ? 0.1 : 0.05;

  return {
    merchant,
    date,
    total,
    currency,
    currencySure: sure,
    items,
    extras,
    confidence: Math.min(1, Math.round(confidence * 100) / 100),
  };
}
