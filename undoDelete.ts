import { useSyncExternalStore } from "react";
import { deleteTransaction, type Txn } from "./api";

/**
 * Delete with undo instead of an "Are you sure?".
 *
 * A delete hides the row at once and waits; the request goes out only when the
 * undo window closes, so Undo is instant and costs no round trip. One delete is
 * pending at a time — starting another sends the first straight away.
 *
 * A module-level store rather than context: the trash button lives in a modal,
 * the toast at the root, and the rows in three different screens.
 */

export const UNDO_MS = 5000;

type Pending = {
  txn: Txn;
  token: string;
  timer: ReturnType<typeof setTimeout>;
  onCommitted: () => void;
  onFailed: (e: unknown) => void;
};

type Snapshot = {
  /** Rows to leave out of every list: pending deletes and sent ones. */
  hidden: ReadonlySet<string>;
  pending: Txn | null;
};

let pending: Pending | null = null;
let snapshot: Snapshot = { hidden: new Set(), pending: null };
const listeners = new Set<() => void>();

function set(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function withHidden(id: string, on: boolean): Set<string> {
  const s = new Set(snapshot.hidden);
  if (on) s.add(id);
  else s.delete(id);
  return s;
}

async function commit(p: Pending) {
  try {
    await deleteTransaction(p.token, p.txn.id);
    // Stays hidden: the row is gone, and the next load will agree.
    p.onCommitted();
  } catch (e) {
    // Put it back rather than pretend it went.
    set({ hidden: withHidden(p.txn.id, false) });
    p.onFailed(e);
  }
}

export function scheduleDelete(args: {
  token: string;
  txn: Txn;
  onCommitted: () => void;
  onFailed: (e: unknown) => void;
}) {
  flushDelete();
  const p: Pending = {
    ...args,
    timer: setTimeout(() => {
      if (pending === p) {
        pending = null;
        set({ pending: null });
        void commit(p);
      }
    }, UNDO_MS),
  };
  pending = p;
  set({ hidden: withHidden(args.txn.id, true), pending: args.txn });
}

/** Restores the row. Nothing was sent, so nothing needs undoing on the server. */
export function undoDelete() {
  if (!pending) return;
  clearTimeout(pending.timer);
  const id = pending.txn.id;
  pending = null;
  set({ hidden: withHidden(id, false), pending: null });
}

/** Sends a pending delete now — on backgrounding, or when another starts. */
export function flushDelete() {
  if (!pending) return;
  const p = pending;
  clearTimeout(p.timer);
  pending = null;
  set({ pending: null });
  void commit(p);
}

export function useHiddenTxnIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => snapshot.hidden);
}

export function usePendingDelete(): Txn | null {
  return useSyncExternalStore(subscribe, () => snapshot.pending);
}

