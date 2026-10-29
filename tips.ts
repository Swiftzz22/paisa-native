import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

/**
 * One-time tips, each shown once and gone for good after "Got it".
 *
 * They are spaced out by how many times the dashboard has been opened, so a
 * new user meets one idea at a time instead of a tour on the first launch, and
 * only one tip is ever up at once: a later tip waits for the earlier to go.
 */
export type TipId = "monthBars" | "ask";

/** In order. `fromOpen` is the dashboard open (1-based) it may first appear on. */
const TIPS: { id: TipId; fromOpen: number }[] = [
  { id: "monthBars", fromOpen: 2 },
  { id: "ask", fromOpen: 3 },
];

const OPENS_KEY = "paisa.dashOpens";
const seenKey = (id: TipId) => `paisa.tip.${id}`;

/**
 * Counts this dashboard open and says which tip, if any, to show. Meant for
 * the dashboard's own mount, which happens once per launch since tabs stay
 * mounted.
 */
export function useDashboardTip(): { tip: TipId | null; dismiss: (id: TipId) => void } {
  const [tip, setTip] = useState<TipId | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const opens = Number((await SecureStore.getItemAsync(OPENS_KEY)) ?? "0") + 1;
        await SecureStore.setItemAsync(OPENS_KEY, String(opens));
        for (const t of TIPS) {
          if ((await SecureStore.getItemAsync(seenKey(t.id))) === "1") continue;
          // The first unseen tip decides: if it is not due yet, nothing shows.
          if (alive && opens >= t.fromOpen) setTip(t.id);
          return;
        }
      } catch {
        // Keychain unavailable: no tips is the right failure.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const dismiss = useCallback((id: TipId) => {
    setTip((cur) => (cur === id ? null : cur));
    SecureStore.setItemAsync(seenKey(id), "1").catch(() => {});
  }, []);

  return { tip, dismiss };
}
