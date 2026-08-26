import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import Constants, { ExecutionEnvironment } from "expo-constants";

const PREF_KEY = "paisa_biometric_lock";
const INTRO_KEY = "paisa_seen_intro";

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

/** Prompt for Face ID / Touch ID (with device-passcode fallback). */
export async function authenticate(): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock paisa",
      fallbackLabel: "Use passcode",
      cancelLabel: "Cancel",
    });
    return res.success;
  } catch {
    return false;
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
