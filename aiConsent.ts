import * as SecureStore from "expo-secure-store";

/**
 * Permission to send someone's data to the AI services paisa. depends on.
 *
 * App Review Guideline 5.1.2(i) requires the app to name the third-party AI a
 * person's data goes to, say what is sent, and get an explicit yes before the
 * first request — a line in the privacy policy does not count. Every path that
 * reaches a model asks here first: uploading a statement, connecting a mailbox,
 * and asking a question.
 *
 * Declining is a real choice, not a wall. Adding, editing and viewing
 * transactions by hand never touch a model, so the app stays usable without it.
 *
 * Stored on the device and cleared on sign-out, so a second person signing in
 * on the same phone is asked for themselves rather than inheriting a yes.
 */

// v2: bank alerts may now go to Google (Gemini) when NVIDIA is down. A yes
// given to the v1 wording didn't cover that, so everyone is asked once more.
const KEY = "paisa_ai_consent_v2";

let cached: boolean | null = null;

export async function hasAiConsent(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    cached = (await SecureStore.getItemAsync(KEY)) === "yes";
  } catch {
    cached = false;
  }
  return cached;
}

export async function setAiConsent(allowed: boolean): Promise<void> {
  cached = allowed;
  try {
    if (allowed) await SecureStore.setItemAsync(KEY, "yes");
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // The in-memory answer still holds for this session.
  }
}

/** Forget the answer, so the next account on this phone is asked afresh. */
export async function clearAiConsent(): Promise<void> {
  await setAiConsent(false);
  cached = null;
}

type Asker = () => Promise<boolean>;
let asker: Asker | null = null;

/** Mounted once, at the root, by the sheet that does the asking. */
export function onRequestAiConsent(fn: Asker | null): void {
  asker = fn;
}

/**
 * Resolve true if data may be sent, asking first when it has not been agreed.
 * Call this before any request that will reach a model.
 */
export async function requestAiConsent(): Promise<boolean> {
  if (await hasAiConsent()) return true;
  if (!asker) return false;
  const allowed = await asker();
  if (allowed) await setAiConsent(true);
  return allowed;
}
