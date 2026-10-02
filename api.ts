import * as SecureStore from "expo-secure-store";
import { showPaywall } from "./paywallBus";

export const API_BASE = "https://paisa-tawny.vercel.app";
const TOKEN_KEY = "paisa_mobile_token";

export type Dashboard = {
  user: {
    /** This account's id — used to identify the app to RevenueCat. */
    id?: string;
    name: string | null;
    email: string;
    /** Whether Sign in with Apple already opens this account. */
    appleLinked?: boolean;
    /** Whether paisa. plus is live, as the server sees it. */
    plus?: boolean;
  };
  /** Whether a Gmail account is linked, so an empty screen can explain itself. */
  emailConnected?: boolean;
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
    timeKnown?: boolean;
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
  /**
   * False when the stored time is a date-only placeholder — statement imports
   * and the web's date form record noon rather than a real moment.
   */
  timeKnown?: boolean;
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

/**
 * The server refused because this needs paisa. plus.
 *
 * Distinct from a generic failure so the app can answer with the offer rather
 * than an error banner — the refusal and the way past it belong together, at
 * the moment the person actually wanted the thing.
 */
export class PaywallError extends Error {}

async function authed<T>(
  token: string,
  path: string,
  init?: RequestInit,
  /**
   * Suppress the paywall sheet for a call the person did not make.
   *
   * The open-the-app sync is the case: a free account would meet the sheet on
   * every single launch, which is nagging rather than offering. The request
   * still fails and the caller still learns why — it just does not interrupt.
   */
  opts?: { silentPaywall?: boolean }
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
  if (res.status === 402) {
    let msg = "This is part of paisa. plus.";
    try {
      const j = await res.json();
      if (j?.error) msg = String(j.error);
    } catch {
      // non-JSON body — the default reads fine
    }
    // Raise the offer here so every refused call gets it, however deep the
    // caller is. The throw still stops the caller; it just no longer has to
    // decide what a 402 means.
    if (!opts?.silentPaywall) showPaywall(msg);
    throw new PaywallError(msg);
  }
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

/**
 * Disconnect every mailbox. Used when AI permission is withdrawn: mail is read
 * on the server, so stopping on the phone alone would not stop it.
 */
export function disconnectEmail(token: string): Promise<{ ok: true }> {
  return authed(token, "/api/mobile/email", { method: "DELETE" });
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
  /** Per-calendar-day totals in the viewer's zone, for the calendar strip. */
  days?: DayTotal[];
  /** The one or two transactions that explain the total. */
  highlights?: Highlight[];
};

export type DayTotal = {
  /** YYYY-MM-DD in the viewer's timezone. */
  date: string;
  spent: number;
  received: number;
  txCount: number;
};

export type Highlight = {
  kind: "spend" | "received";
  id: string;
  merchant: string;
  category: string;
  amount: number;
  /** ISO timestamp. */
  at: string;
};

export type MonthlyBar = { key: string; label: string; total: number };

/**
 * Authoritative summary for an arbitrary window. The app computes one locally
 * for an instant result, but only holds recent history — this covers the rest.
 */
export async function fetchRangeInsights(
  token: string,
  from: Date,
  to: Date
): Promise<Insights> {
  const q = new URLSearchParams({
    tzOffset: String(tzOffsetMinutes()),
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const res = await authed<{ range: Insights }>(
    token,
    `/api/mobile/insights?${q.toString()}`
  );
  return res.range;
}

/** All four periods in one payload, so switching tabs needs no network. */
export type InsightsBundle = Record<Period, Insights>;

export type InsightsPayload = {
  periods: InsightsBundle;
  /** Twelve months of spending, oldest first, for the trend chart. */
  monthly: MonthlyBar[];
};

export async function fetchInsights(token: string): Promise<InsightsPayload> {
  // The server builds period boundaries from this — without it "today" would
  // start at 05:30 for a user in India, since Vercel runs in UTC.
  const res = await authed<
    Insights & { periods?: InsightsBundle; monthly?: MonthlyBar[] }
  >(token, `/api/mobile/insights?tzOffset=${tzOffsetMinutes()}`);
  if (res.periods) return { periods: res.periods, monthly: res.monthly ?? [] };
  // Server predates the bundled response — fall back to the single period it
  // returned so the screen still renders something sensible.
  const single = res as Insights;
  return {
    periods: { day: single, week: single, month: single, year: single },
    monthly: [],
  };
}

/**
 * Permanently delete the account. Apple requires this to be reachable from
 * inside the app. `confirmEmail` must match the signed-in address — the server
 * checks it too, so a mistaken tap cannot get through.
 */
export function deleteAccount(
  token: string,
  confirmEmail: string
): Promise<{ ok: true; transactions: number; emails: number }> {
  return authed(token, "/api/mobile/account", {
    method: "DELETE",
    body: JSON.stringify({ confirmEmail }),
  });
}

/**
 * This account's private forwarding address, or null when the server has no
 * inbound mail domain set up — in which case the app says nothing about it
 * rather than offering something that cannot work yet.
 */
export type Forwarding = {
  address: string | null;
  /** The Gmail search to build the filter from, generated by the server. */
  filter: string;
  /** Set while Gmail is waiting for the code it sent to the address. */
  pendingCode: string | null;
  lastReceivedAt: string | null;
  recentCount: number;
};

export function fetchForwardingAddress(token: string): Promise<Forwarding> {
  return authed(token, "/api/mobile/forwarding");
}

/** Replace it. The old address stops accepting mail immediately. */
export function rotateForwardingAddress(
  token: string
): Promise<{ address: string | null }> {
  return authed(token, "/api/mobile/forwarding", { method: "POST" });
}

export type ImportResult = {
  ok: true;
  added: number;
  duplicates: number;
  failed: number;
  rows: number;
  /** Anything the reader couldn't manage — a page it failed to read, say. */
  warnings?: string[];
};

/**
 * Upload a bank statement — CSV, spreadsheet or PDF. Runs the same importer
 * the website uses, so duplicates are caught the same way.
 *
 * Sent as multipart rather than JSON so the file streams instead of being
 * base64'd into memory twice.
 */
export async function importStatement(
  token: string,
  file: { uri: string; name: string; mimeType?: string | null }
): Promise<ImportResult> {
  const form = new FormData();
  // React Native's FormData takes this shape for a file; it is not a browser Blob.
  form.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType ?? "application/octet-stream",
  } as unknown as Blob);

  const res = await fetch(`${API_BASE}/api/mobile/import`, {
    method: "POST",
    // Content-Type is deliberately unset: fetch must add the multipart boundary.
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (res.status === 401) throw new AuthError("Token is invalid or expired.");
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Upload failed (${res.status}).`);
  return body as ImportResult;
}

export type SyncResult = {
  fetched: number;
  parsed: number;
  pending?: number;
  datesFixed?: number;
  busy?: boolean;
  error?: string | null;
};

/**
 * Pull the latest bank/UPI emails and parse a batch into transactions.
 *
 * Silent on 402. This runs on every app open, and a free account meeting the
 * paywall sheet each time would be nagging. Settings says plainly that sync is
 * part of Plus; that is where the offer belongs.
 */
export function syncNow(token: string): Promise<SyncResult> {
  return authed<SyncResult>(
    token,
    "/api/mobile/sync",
    { method: "POST" },
    { silentPaywall: true }
  );
}

export type ImportSummary = {
  id: string;
  filename: string;
  bank: string;
  /** ISO timestamp. */
  importedAt: string;
  remaining: number;
  spent: number;
  received: number;
};

/** Statements this account has imported, newest first. */
export async function fetchImports(token: string): Promise<ImportSummary[]> {
  const res = await authed<{ imports: ImportSummary[] }>(token, "/api/mobile/data");
  return res.imports;
}

/** Undo one import — removes only the transactions that came from that file. */
export function deleteImport(
  token: string,
  batchId: string
): Promise<{ ok: true; deleted: number }> {
  return authed(token, "/api/mobile/data", {
    method: "DELETE",
    body: JSON.stringify({ scope: "import", batchId }),
  });
}

/**
 * Remove every transaction, keeping the account and everything set up around
 * it. `confirm` must be the word DELETE.
 */
export function deleteAllTransactions(
  token: string,
  confirm: string
): Promise<{ ok: true; deleted: number; emailsReset: number }> {
  return authed(token, "/api/mobile/data", {
    method: "DELETE",
    body: JSON.stringify({ scope: "all", confirm }),
  });
}
