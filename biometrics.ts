import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import Constants, { ExecutionEnvironment } from "expo-constants";

const PREF_KEY = "paisa_biometric_lock";
const INTRO_KEY = "paisa_seen_intro";

const SYNCED_KEY = "paisa_last_sync_at";

/** How long an open-the-app sync stays good for. */
const SYNC_FRESH_MS = 15 * 60_000;

/** True when a sync ran recently enough that another would be wasted work. */
export async function syncedRecently(): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(SYNCED_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < SYNC_FRESH_MS;
  } catch {
    return false;
  }
}

export async function markSynced(): Promise<void> {
  try {
    await SecureStore.setItemAsync(SYNCED_KEY, String(Date.now()));
  } catch {
    // Non-fatal: the worst case is syncing on the next open too.
  }
}

/** Whether the one-time intro has already been shown on this device. */
export async function hasSeenIntro(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(INTRO_KEY)) === "1";
  } catch {
    // Storage unavailable — better to skip the intro than to loop on it.
    return true;
  }
}

export async function markIntroSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(INTRO_KEY, "1");
  } catch {
    // Non-fatal: the worst case is seeing the intro twice.
  }
}

/**
 * Face ID does not work inside Expo Go on iOS — Apple ties it to the host app's
 * own Info.plist, so the prompt silently degrades to the device passcode no
 * matter what this app asks for. Real builds (eas build) get Face ID properly.
 */
export const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** True only if the device has biometric hardware AND the user has enrolled. */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const [hasHardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

/** Lock preference — defaults ON when biometrics are available. */
export async function getLockEnabled(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(PREF_KEY);
  if (v === null) return true;
  return v === "1";
}

export async function setLockEnabled(on: boolean): Promise<void> {
  await SecureStore.setItemAsync(PREF_KEY, on ? "1" : "0");
}

/** Should the app show the lock screen right now? */
export async function shouldLock(): Promise<boolean> {
  return (await isBiometricAvailable()) && (await getLockEnabled());
}

export type AuthOutcome =
  /** Unlocked. */
  | { status: "ok" }
  /** The person dismissed the sheet. Not a failure — say nothing. */
  | { status: "cancelled" }
  /** Face ID could not be used at all. `reason` is for the person, not the log. */
  | { status: "unavailable"; reason: string }
  /** The scan ran and did not match. Trying again is worth doing. */
  | { status: "failed"; reason: string };

/**
 * Prompt for Face ID / Touch ID, falling back to the device passcode.
 *
 * Every failure used to collapse into `false`, which meant a denied Face ID
 * permission, a lockout after five bad scans, and a cancelled sheet all looked
 * identical from the lock screen: a button that did nothing. The caller needs
 * to tell them apart, because two of those are not retryable.
 *
 * `disableDeviceFallback` stays false so iOS offers the passcode itself after a
 * few misses — without it a face the sensor stops recognising (a mask, poor
 * light, a sibling's phone case over the TrueDepth camera) has no way through
 * at all.
 */
export async function authenticate(): Promise<AuthOutcome> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock paisa",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    if (res.success) return { status: "ok" };

    switch (res.error) {
      // Tapping Cancel is a choice. Saying anything about it would be noise.
      case "user_cancel":
        return { status: "cancelled" };

      // iOS pulled the sheet away by itself. This is what a prompt raised
      // before the app is active looks like, and staying silent about it is
      // exactly what made the old bug unreadable — it is indistinguishable
      // from a face that didn't match unless it is named.
      case "app_cancel":
      case "system_cancel":
        return {
          status: "failed",
          reason: "iOS closed the Face ID prompt before it could run. Tap to try again.",
        };

      // Hardware is present and enrolled, yet iOS still refuses: on a real
      // build that almost always means Face ID was denied for this app at the
      // first prompt. Only Settings can undo it.
      case "not_available":
        return {
          status: "unavailable",
          reason:
            "iOS is not letting paisa use Face ID. Open Settings › paisa and turn Face ID on.",
        };

      case "not_enrolled":
        return {
          status: "unavailable",
          reason: "No face or fingerprint is set up on this iPhone yet.",
        };

      case "passcode_not_set":
        return {
          status: "unavailable",
          reason: "This iPhone has no passcode, so there is nothing to unlock with.",
        };

      // Five failed scans in a row. iOS disables Face ID until the passcode is
      // entered once — which the fallback sheet handles, so this is retryable.
      case "lockout":
        return {
          status: "failed",
          reason: "Too many attempts. Try again and enter your passcode.",
        };

      case "authentication_failed":
        return { status: "failed", reason: "That didn't match. Try again." };

      // Nothing this code knows how to explain. Show iOS's own word for it
      // rather than a generic apology: there is no console to read on a
      // TestFlight build, so an unnamed failure is a failure nobody can chase.
      default:
        return {
          status: "failed",
          reason: `Couldn't unlock (${res.error ?? "no error reported"}). Try again.`,
        };
    }
  } catch (e) {
    return {
      status: "failed",
      reason: `Couldn't unlock (${(e as Error)?.message ?? "threw"}). Try again.`,
    };
  }
}

/**
 * Human label for the unlock method, for settings/lock copy. Inside Expo Go this
 * always says Passcode — claiming "Face ID" there promises something iOS will
 * not actually do.
 */
export async function biometricLabel(): Promise<string> {
  if (IS_EXPO_GO) return "passcode";
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return "Face ID";
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return "Touch ID";
    }
    return "biometric unlock";
  } catch {
    return "biometric unlock";
  }
}
