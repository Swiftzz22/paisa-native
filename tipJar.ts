import * as SecureStore from "expo-secure-store";

/**
 * The tip jar.
 *
 * Three purchases that unlock nothing. Every feature in paisa. works the same
 * before and after — this exists only so someone who finds the app useful can
 * say so, and so the Gemini bill has somewhere to come from.
 *
 * Deliberately not a paywall. Gating the parts of the app that cost money to
 * run would earn more and would also mean an entitlement to verify, a server
 * that has to be told who paid, renewals, refunds and grace periods. None of
 * that exists here, because nothing is being withheld.
 *
 * The products are CONSUMABLE, which is the whole design:
 *
 *  - a consumable can be bought again, so someone can tip more than once,
 *    which is what a tip is for;
 *  - App Review requires a Restore Purchases control for non-consumables, and
 *    restoring a tip is meaningless — there is nothing to restore;
 *  - nothing is unlocked, so there is no state worth syncing across devices.
 *
 * That last point is what keeps this offline: the thank-you is remembered on
 * the device that gave it, and losing that memory on reinstall costs nobody
 * anything.
 */

/** Must match the product IDs created in App Store Connect exactly. */
export const TIP_SKUS = [
  "com.saniakothari.paisa.tip.small",
  "com.saniakothari.paisa.tip.medium",
  "com.saniakothari.paisa.tip.large",
] as const;

export type TipSku = (typeof TIP_SKUS)[number];

/**
 * What each tip is called in the app.
 *
 * The price is not written here — it comes from the store, localised, and in
 * whichever currency the person's App Store account uses. Hard-coding "₹299"
 * would be wrong for every user outside India and wrong for everyone the day
 * the price changes.
 */
export const TIP_LABELS: Record<TipSku, { title: string; blurb: string }> = {
  "com.saniakothari.paisa.tip.small": {
    title: "Small tip",
    blurb: "Covers a few hundred bank emails being read",
  },
  "com.saniakothari.paisa.tip.medium": {
    title: "Nice tip",
    blurb: "Covers a month of running paisa. for everyone",
  },
  "com.saniakothari.paisa.tip.large": {
    title: "Generous tip",
    blurb: "Genuinely a lot. Thank you",
  },
};

const TIPPED_KEY = "paisa_has_tipped";

/** Whether this device has already given something. */
export async function hasTipped(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(TIPPED_KEY)) === "1";
  } catch {
    // Storage unavailable. Showing the tip jar again is a far better failure
    // than hiding it from someone who never used it.
    return false;
  }
}

export async function markTipped(): Promise<void> {
  try {
    await SecureStore.setItemAsync(TIPPED_KEY, "1");
  } catch {
    // Non-fatal: the worst case is being thanked less warmly next time.
  }
}
