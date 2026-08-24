import * as SecureStore from "expo-secure-store";

export const API_BASE = "https://paisa-tawny.vercel.app";
const TOKEN_KEY = "paisa_mobile_token";

export type Dashboard = {
  user: { name: string | null; email: string };
  monthLabel: string;
  spent: number;
  deltaPercent: number; // fraction, e.g. -0.12
  budget: {
    left: number;
    cap: number;
    daysElapsed: number;
    daysInMonth: number;
    pct: number;
  } | null;
  categories: { name: string; amount: number; pct: number; color: string }[];
  recent: {
    id: string;
    merchant: string;
    category: string;
    categoryId?: string | null;
    amount: number;
    type: "debit" | "credit";
    paymentMode: string;
    occurredAt: string;
  }[];
};

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token.trim());
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export type Txn = {
  id: string;
  merchant: string;
  category: string;
  categoryId?: string | null;
  amount: number;
  type: "debit" | "credit";
  paymentMode: string;
  note?: string | null;
  occurredAt: string;
};

export type Meta = {
  categories: { id: string; label: string; depth: 0 | 1 }[];
  paymentModes: { value: string; label: string }[];
};

export type NewTxn = {
  amount: number;
  merchant: string;
  categoryId: string;
  paymentMode: string;
  type: "debit" | "credit";
  note?: string;
};

export class AuthError extends Error {}

async function authed<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401) throw new AuthError("Token is invalid or expired.");
  if (!res.ok) {
    let msg = `Server error (${res.status}).`;
    try {
      const j = await res.json();
      if (j?.error) msg = String(j.error);
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

/** Minutes ahead of UTC (+330 for IST); getTimezoneOffset reports the inverse. */
export function tzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/** Fetch the dashboard. Throws AuthError on 401 so the UI can re-prompt. */
export function fetchDashboard(token: string): Promise<Dashboard> {
  // Sent so the hero card's month matches the one Insights uses.
  return authed<Dashboard>(
    token,
    `/api/mobile/dashboard?tzOffset=${tzOffsetMinutes()}`
  );
}

/**
 * How much history to hold on-device. A year is only a few hundred rows, so it
 * fits comfortably in memory and lets search and the spend/income drill-downs
 * run locally with no request per interaction.
 */
export const HISTORY_LIMIT = 500;

export function fetchTransactions(
  token: string,
  cursor?: string | null,
  limit?: number
): Promise<{ items: Txn[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("limit", String(limit));
  const q = params.toString();
  return authed(token, `/api/mobile/transactions${q ? `?${q}` : ""}`);
}

export function fetchMeta(token: string): Promise<Meta> {
  return authed<Meta>(token, "/api/mobile/meta");
}

export function createTransaction(
  token: string,
  body: NewTxn
): Promise<{ transaction: Txn }> {
  return authed(token, "/api/mobile/transactions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateTransaction(
  token: string,
  id: string,
  body: NewTxn
): Promise<{ ok: true }> {
  return authed(token, `/api/mobile/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteTransaction(token: string, id: string): Promise<{ ok: true }> {
  return authed(token, `/api/mobile/transactions/${id}`, { method: "DELETE" });
}

export function ask(
  token: string,
  message: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<{ answer: string }> {
  return authed(token, "/api/mobile/ask", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
}

export type Period = "day" | "week" | "month" | "year";

export type Insights = {
  period: Period;
  label: string;
  from: string;
  to: string;
  spent: number;
  received: number;
  /** spent - received; negative when more came in than went out. */
  net: number;
  txCount: number;
  categories: {
    name: string;
    amount: number;
    pct: number;
    color: string;
    txCount: number;
  }[];
  paymentModes: {
    mode: string;
    label: string;
    amount: number;
    pct: number;
    color: string;
    txCount: number;
  }[];
};

/** All four periods in one payload, so switching tabs needs no network. */
export type InsightsBundle = Record<Period, Insights>;

export async function fetchInsights(token: string): Promise<InsightsBundle> {
  // The server builds period boundaries from this — without it "today" would
  // start at 05:30 for a user in India, since Vercel runs in UTC.
  const res = await authed<Insights & { periods?: InsightsBundle }>(
    token,
    `/api/mobile/insights?tzOffset=${tzOffsetMinutes()}`
  );
  if (res.periods) return res.periods;
  // Server predates the bundled response — fall back to the single period it
  // returned so the screen still renders something sensible.
  const single = res as Insights;
  return { day: single, week: single, month: single, year: single };
}

export type SyncResult = {
  fetched: number;
  parsed: number;
  pending?: number;
  datesFixed?: number;
  busy?: boolean;
  error?: string | null;
};

/** Pull the latest bank/UPI emails and parse a batch into transactions. */
export function syncNow(token: string): Promise<SyncResult> {
  return authed<SyncResult>(token, "/api/mobile/sync", { method: "POST" });
}
