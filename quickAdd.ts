/**
 * Quick add: one line of text in, the parts of a transaction out.
 *
 *   "412 zomato upi"            → ₹412 · Zomato · UPI
 *   "₹1,200 dmart card yesterday" → ₹1,200 · Dmart · Card · yesterday
 *   "1.2k dinner with riya"     → ₹1,200 · Dinner · with Riya
 *
 * Plain rules on the device, no AI: nothing typed here leaves the phone until
 * it is saved like any other transaction. Pure, with no React Native imports,
 * so it runs under tsx for testing.
 */

export type ModeOption = { value: string; label: string };
export type CategoryOption = { id: string; label: string };
export type PastTxn = { merchant: string; categoryId?: string | null };

export type QuickParse = {
  amount: number | null;
  merchant: string | null;
  /** A `value` from the payment modes, or null when none was named. */
  paymentMode: string | null;
  day: "today" | "yesterday" | null;
  /** Who it was with, for the note. */
  withName: string | null;
  categoryId: string | null;
  /** Where the category came from, so the UI can say why. */
  categoryFrom: "history" | "name" | null;
};

/** Words that name a way of paying, mapped to what the mode is called. */
const MODE_WORDS: Record<string, string> = {
  cash: "cash",
  upi: "upi",
  gpay: "upi",
  googlepay: "upi",
  phonepe: "upi",
  paytm: "upi",
  bhim: "upi",
  card: "card",
  credit: "card",
  creditcard: "card",
  debitcard: "card",
  debit: "card",
  visa: "card",
  mastercard: "card",
  rupay: "card",
};

const DAY_WORDS: Record<string, "today" | "yesterday"> = {
  today: "today",
  tod: "today",
  yesterday: "yesterday",
  yday: "yesterday",
  yest: "yesterday",
};

/** Glue words that are never part of a merchant name on their own. */
const FILLER = new Set(["on", "at", "for", "via", "using", "by", "paid", "spent", "to", "in", "from", "the", "a"]);
const CURRENCY = new Set(["₹", "rs", "rs.", "inr", "rupees", "rupee"]);

const AMOUNT = /^(?:₹|rs\.?|inr)?(\d[\d,]*(?:\.\d+)?)(k|l|lakh|lac)?$/i;

function parseAmount(token: string): number | null {
  const m = token.match(AMOUNT);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2]?.toLowerCase();
  const scaled = unit === "k" ? n * 1_000 : unit ? n * 100_000 : n;
  return Math.round(scaled * 100) / 100;
}

function titleCase(s: string): string {
  return s.replace(/(^|\s)(\S)/g, (_, sp: string, c: string) => sp + c.toUpperCase());
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The mode whose value or label contains the keyword, e.g. "upi" → "UPI". */
function findMode(keyword: string, modes: ModeOption[]): string | null {
  const hit =
    modes.find((m) => m.value.toLowerCase() === keyword) ??
    modes.find((m) => m.label.toLowerCase() === keyword) ??
    modes.find(
      (m) => m.value.toLowerCase().includes(keyword) || m.label.toLowerCase().includes(keyword)
    );
  return hit?.value ?? null;
}

export function parseQuickAdd(
  text: string,
  ctx: { modes: ModeOption[]; categories: CategoryOption[]; history: PastTxn[] }
): QuickParse {
  // "₹ 450" and "rs 450" read as one token; so do "1,200".
  const tokens = text
    .replace(/(₹|\brs\.?|\binr)\s+(?=\d)/gi, "$1")
    .split(/\s+/)
    .filter(Boolean);

  let amount: number | null = null;
  let paymentMode: string | null = null;
  let day: QuickParse["day"] = null;
  let withName: string | null = null;
  const rest: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    const low = raw.toLowerCase().replace(/[.,!?]+$/, "");

    if (amount === null) {
      const a = parseAmount(raw.replace(/[!?]+$/, ""));
      if (a !== null) {
        amount = a;
        continue;
      }
    }
    if (CURRENCY.has(low)) continue;

    // "google pay" and "credit card" are two words for one mode.
    const pair = (low + (tokens[i + 1] ?? "").toLowerCase()).replace(/[^a-z]/g, "");
    if (paymentMode === null && MODE_WORDS[pair]) {
      const v = findMode(MODE_WORDS[pair], ctx.modes);
      if (v) {
        paymentMode = v;
        i++;
        continue;
      }
    }
    if (paymentMode === null && MODE_WORDS[low]) {
      const v = findMode(MODE_WORDS[low], ctx.modes);
      if (v) {
        paymentMode = v;
        continue;
      }
    }
    if (day === null && DAY_WORDS[low]) {
      day = DAY_WORDS[low];
      continue;
    }
    if (low === "with" && withName === null && tokens[i + 1]) {
      withName = titleCase(tokens[i + 1].toLowerCase());
      i++;
      continue;
    }
    rest.push(raw);
  }

  // Trim glue words off both ends: "lunch at" → "lunch", "for chai" → "chai".
  while (rest.length && FILLER.has(rest[0].toLowerCase())) rest.shift();
  while (rest.length && FILLER.has(rest[rest.length - 1].toLowerCase())) rest.pop();

  let categoryId: string | null = null;
  let categoryFrom: QuickParse["categoryFrom"] = null;

  // 1. Their own history: the same merchant, spelled any case, was filed under…
  const said = norm(rest.join(" "));
  if (said) {
    const past = ctx.history.find((t) => t.categoryId && norm(t.merchant) === said);
    if (past?.categoryId) {
      categoryId = past.categoryId;
      categoryFrom = "history";
    }
  }

  // 2. A word that is a category name: "450 groceries dmart". The word is
  //    taken out of the merchant unless it is the only thing left.
  if (!categoryId) {
    for (let i = 0; i < rest.length && !categoryId; i++) {
      const w = rest[i].toLowerCase();
      const cat = ctx.categories.find((c) => {
        const label = c.label.toLowerCase();
        return label === w || label.split(/[\s&/,]+/).includes(w) || (w.length >= 4 && label.startsWith(w));
      });
      if (cat) {
        categoryId = cat.id;
        categoryFrom = "name";
        if (rest.length > 1) rest.splice(i, 1);
      }
    }
    // The category word may have been all that hid a known merchant.
    const left = norm(rest.join(" "));
    const past = left ? ctx.history.find((t) => t.categoryId && norm(t.merchant) === left) : null;
    if (past?.categoryId && categoryFrom !== "name") {
      categoryId = past.categoryId;
      categoryFrom = "history";
    }
  }

  // Keep a merchant as they have written it before, else title-case it.
  const merchantRaw = rest.join(" ").trim();
  const known = merchantRaw
    ? ctx.history.find((t) => norm(t.merchant) === norm(merchantRaw))?.merchant
    : undefined;
  const merchant = merchantRaw ? known ?? titleCase(merchantRaw.toLowerCase()) : null;

  return { amount, merchant, paymentMode, day, withName, categoryId, categoryFrom };
}

/** `occurredAt` for the API: undefined means "now", which is what today is. */
export function occurredAtFor(day: QuickParse["day"], now = new Date()): string | undefined {
  if (day !== "yesterday") return undefined;
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return d.toISOString();
}
