import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { Platform } from "react-native";

/**
 * paisa. plus — the client half.
 *
 * This file can open the App Store sheet and report what happened. It cannot
 * grant anything: access is written by RevenueCat's webhook into a column the
 * app has no way to touch, and every guarded endpoint asks the database rather
 * than the phone. So a patched build here buys nothing.
 *
 * What it does do is make the purchase happen and then wait for the server to
 * catch up, which is the part people feel.
 */

/** The entitlement id configured in RevenueCat. All products grant this one. */
export const ENTITLEMENT = "plus";

/**
 * RevenueCat's public SDK key for iOS. Publishable by design — it identifies
 * the app to RevenueCat and authorises nothing on its own. The secret that
 * actually matters is the webhook's, and that lives on the server.
 */
const RC_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";

export function isPlusConfigured(): boolean {
  return RC_IOS_KEY.length > 0;
}

let started = false;

/**
 * Start RevenueCat and tell it who this is.
 *
 * The app's own user id is used as RevenueCat's `appUserID`, which is what
 * lets the webhook find the row without a mapping table. Logging in with the
 * real id rather than letting RevenueCat invent an anonymous one is also what
 * makes a subscription follow the account across devices instead of being
 * stranded on the phone that bought it.
 */
export async function initPlus(userId: string): Promise<void> {
  if (!isPlusConfigured() || Platform.OS !== "ios") return;
  try {
    if (!started) {
      Purchases.configure({ apiKey: RC_IOS_KEY, appUserID: userId });
      started = true;
    } else {
      await Purchases.logIn(userId);
    }
  } catch {
    // A failure here means the paywall cannot open. Everything else in the app
    // keeps working, and the guarded endpoints still answer honestly, so this
    // is never worth interrupting someone over.
  }
}

/** Forget the account on sign-out, so the next person isn't offered theirs. */
export async function resetPlus(): Promise<void> {
  if (!started) return;
  try {
    await Purchases.logOut();
  } catch {
    // Best effort; configure() on the next sign-in sets the identity anyway.
  }
}

export type PlusOffer = {
  pkg: PurchasesPackage;
  /** Localised, from the store — never hard-coded. */
  price: string;
  title: string;
  blurb: string;
};

/** How each package reads in the sheet, keyed by RevenueCat's package type. */
const COPY: Record<string, { title: string; blurb: string }> = {
  ANNUAL: { title: "Yearly", blurb: "Best value — works out cheapest" },
  MONTHLY: { title: "Monthly", blurb: "Cancel whenever you like" },
  LIFETIME: { title: "Lifetime", blurb: "Pay once, keep it forever" },
};

/** The offerings configured in RevenueCat, in the order they should be shown. */
export async function loadOffers(): Promise<PlusOffer[]> {
  if (!isPlusConfigured()) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    const order = ["ANNUAL", "LIFETIME", "MONTHLY"];
    return packages
      .map((pkg) => ({
        pkg,
        price: pkg.product.priceString,
        title: COPY[pkg.packageType]?.title ?? pkg.product.title,
        blurb: COPY[pkg.packageType]?.blurb ?? "",
      }))
      .sort(
        (a, b) =>
          order.indexOf(a.pkg.packageType) - order.indexOf(b.pkg.packageType)
      );
  } catch {
    return [];
  }
}

export type PurchaseOutcome =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

export async function buyPlus(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const active = customerInfo.entitlements.active[ENTITLEMENT];
    if (!active) {
      return {
        ok: false,
        cancelled: false,
        message: "The purchase went through but didn't unlock. Try Restore.",
      };
    }
    return { ok: true };
  } catch (e) {
    // Backing out of Apple's sheet is a choice, not a failure.
    if ((e as { userCancelled?: boolean })?.userCancelled) {
      return { ok: false, cancelled: true };
    }
    return {
      ok: false,
      cancelled: false,
      message: "That didn't complete. You haven't been charged.",
    };
  }
}

/**
 * Required by App Review for non-consumables, and genuinely needed: a new
 * phone, a reinstall, or a reinstalled account all arrive with nothing.
 */
export async function restorePlus(): Promise<boolean> {
  try {
    const info = await Purchases.restorePurchases();
    return Boolean(info.entitlements.active[ENTITLEMENT]);
  } catch {
    return false;
  }
}
