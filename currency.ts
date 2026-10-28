import * as SecureStore from "expo-secure-store";

/**
 * Currencies for foreign spending (paisa. plus).
 *
 * The server can convert 200-odd codes, but a picker listing all of them buries
 * the dozen anyone actually travels with under Azerbaijani manat. So this is
 * the list people from India most often spend in, roughly by how often, and
 * search covers the rest of the list by code or name.
 */
export type Currency = { code: string; symbol: string; name: string };

export const HOME: Currency = { code: "INR", symbol: "₹", name: "Indian Rupee" };

export const CURRENCIES: Currency[] = [
  HOME,
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "AED", symbol: "AED", name: "UAE Dirham" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah" },
  { code: "LKR", symbol: "Rs", name: "Sri Lankan Rupee" },
  { code: "NPR", symbol: "रू", name: "Nepalese Rupee" },
  { code: "BDT", symbol: "৳", name: "Bangladeshi Taka" },
  { code: "MVR", symbol: "Rf", name: "Maldivian Rufiyaa" },
  { code: "VND", symbol: "₫", name: "Vietnamese Dong" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "KRW", symbol: "₩", name: "South Korean Won" },
  { code: "CNY", symbol: "CN¥", name: "Chinese Yuan" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "SAR", symbol: "SAR", name: "Saudi Riyal" },
  { code: "QAR", symbol: "QAR", name: "Qatari Riyal" },
  { code: "OMR", symbol: "OMR", name: "Omani Rial" },
  { code: "KWD", symbol: "KWD", name: "Kuwaiti Dinar" },
  { code: "BHD", symbol: "BHD", name: "Bahraini Dinar" },
  { code: "JOD", symbol: "JOD", name: "Jordanian Dinar" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone" },
  { code: "DKK", symbol: "kr", name: "Danish Krone" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso" },
  { code: "TWD", symbol: "NT$", name: "New Taiwan Dollar" },
];

export function currencyFor(code: string): Currency {
  return (
    CURRENCIES.find((c) => c.code === code) ?? { code, symbol: code, name: code }
  );
}

/** Currencies nobody writes with decimals. Showing "¥1,200.00" looks broken. */
const NO_DECIMALS = new Set(["JPY", "KRW", "IDR", "VND"]);

/** Dinars are counted in fils, a thousandth each: "KWD 0.750", not "KWD 0.75". */
const THREE_DECIMALS = new Set(["KWD", "BHD", "OMR", "JOD"]);

/** "S$12.50", "¥1,200", "AED 45.00". All-letter symbols get a space; anything with a mark doesn't. */
export function money(amount: number, code: string): string {
  const { symbol } = currencyFor(code);
  const digits = NO_DECIMALS.has(code) ? 0 : THREE_DECIMALS.has(code) ? 3 : 2;
  const n = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return /^[A-Za-z]{2,}$/.test(symbol) ? `${symbol} ${n}` : `${symbol}${n}`;
}

const LAST_KEY = "paisa_last_foreign_currency";

/**
 * The foreign currency used last, so a week in Bangkok means picking baht once
 * rather than on every coffee.
 */
export async function lastForeignCurrency(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(LAST_KEY);
  } catch {
    return null;
  }
}

export async function rememberForeignCurrency(code: string): Promise<void> {
  if (code === HOME.code) return;
  try {
    await SecureStore.setItemAsync(LAST_KEY, code);
  } catch {
    // A convenience; forgetting it costs one extra tap.
  }
}

/** YYYY-MM-DD for a moment in the phone's own timezone. */
export function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
