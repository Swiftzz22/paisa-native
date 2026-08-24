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

/** Fetch the dashboard. Throws AuthError on 401 so the UI can re-prompt. */
export function fetchDashboard(token: string): Promise<Dashboard> {
  return authed<Dashboard>(token, "/api/mobile/dashboard");
}

export function fetchTransactions(
  token: string,
  cursor?: string | null
): Promise<{ items: Txn[]; nextCursor: string | null }> {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return authed(token, `/api/mobile/transactions${q}`);
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

export function fetchInsights(token: string, period: Period): Promise<Insights> {
  return authed<Insights>(token, `/api/mobile/insights?period=${period}`);
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
