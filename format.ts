/** ₹1,299 — Indian grouping, no decimals. */
export function inr(n: number): string {
  return "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "1:24 pm" in local time — formatted by hand so it's identical on every engine. */
function clockTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? "am" : "pm";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** "11 Aug" this year, "11 Aug 2025" otherwise. */
function absoluteDate(d: Date, now: Date): string {
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/**
 * Always the real date and time: "19 Aug, 7:39 pm" ("19 Aug 2025, 7:39 pm"
 * outside the current year). Today and yesterday keep their word so the list
 * still scans quickly, but every row carries a clock time — a relative-only
 * label ("3 days ago") hides exactly the detail needed to spot a mis-dated
 * transaction.
 */
export function relativeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);

  if (days === 0) return `Today, ${clockTime(d)}`;
  if (days === 1) return `Yesterday, ${clockTime(d)}`;
  return `${absoluteDate(d, now)}, ${clockTime(d)}`;
}

const PALETTE = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6",
];

/** Deterministic color for a category name — same name, same color everywhere. */
export function categoryColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Map a category name to a rough Ionicon. Falls back to a generic tag. */
export function categoryIcon(name: string): string {
  const n = name.toLowerCase();
  if (/food|dining|restaurant|grocer|swiggy|zomato|eat/.test(n)) return "fast-food";
  if (/transport|travel|uber|ola|fuel|cab|taxi|metro|auto/.test(n)) return "car";
  if (/shop|amazon|flipkart|cloth|retail/.test(n)) return "bag-handle";
  if (/bill|util|electric|recharge|phone|internet|dth/.test(n)) return "receipt";
  if (/rent|home|house/.test(n)) return "home";
  if (/health|medic|pharm|doctor|hospital/.test(n)) return "medkit";
  if (/entertain|movie|netflix|spotify|subscri/.test(n)) return "play";
  if (/invest|saving|mutual|stock|sip/.test(n)) return "trending-up";
  return "pricetag";
}
