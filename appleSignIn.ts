import * as AppleAuthentication from "expo-apple-authentication";
import { API_BASE, saveToken } from "./api";
import type { SignInResult } from "./googleSignIn";

/**
 * Sign in with Apple.
 *
 * Required by App Review guideline 4.8 because the app offers Google sign-in,
 * and the only way an App Review tester can get in at all — they have an Apple
 * ID, not the account holder's Google login.
 *
 * Unlike the Google flow this needs no browser: iOS presents the sheet
 * natively and hands back a signed identity token, which the backend verifies
 * against Apple's public keys.
 *
 * The nonce comes from the server, never from here. Apple echoes it back
 * verbatim on the native flow rather than hashing it, so a value this app
 * invented would prove nothing — it could replay its own token alongside its
 * own nonce. Only a nonce the server issued and remembers rules that out.
 */
export async function signInWithApple(): Promise<SignInResult> {
  // Only worth showing on hardware that supports it: it is iOS 13+, and never
  // available on Android.
  if (!(await isAppleSignInAvailable())) {
    return {
      ok: false,
      cancelled: false,
      message: "Sign in with Apple isn't available on this device.",
    };
  }

  let nonce: string;
  try {
    const res = await fetch(`${API_BASE}/api/auth/apple/nonce`, {
      method: "POST",
    });
    if (!res.ok) {
      return {
        ok: false,
        cancelled: false,
        message: `Couldn't start sign-in (server ${res.status}).`,
      };
    }
    nonce = ((await res.json()) as { nonce: string }).nonce;
  } catch {
    return {
      ok: false,
      cancelled: false,
      message: "Couldn't reach paisa. Check your connection.",
    };
  }

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce,
    });
  } catch (e) {
    // Dismissing the sheet is a choice, not a failure, and must not raise an
    // error banner.
    const code = (e as { code?: string })?.code;
    if (code === "ERR_REQUEST_CANCELED") {
      return { ok: false, cancelled: true };
    }
    // Name the code. A TestFlight build has no console, so "didn't complete"
    // was a dead end — and the codes here mean very different things:
    // ERR_REQUEST_UNKNOWN is usually the Sign In with Apple capability missing
    // from the App ID, while ERR_REQUEST_NOT_HANDLED is a device/network
    // problem the person can actually retry past.
    return {
      ok: false,
      cancelled: false,
      message: `Apple sign-in didn't complete (${code ?? (e as Error)?.message ?? "no code"}).`,
    };
  }

  if (!credential.identityToken) {
    return {
      ok: false,
      cancelled: false,
      message: "Apple didn't return a sign-in token. Please try again.",
    };
  }

  // The name arrives only on the very first authorization, and never again —
  // so it is passed through now or lost. The server treats it as untrusted,
  // because it comes from the device rather than from Apple.
  const fullName = [
    credential.fullName?.givenName,
    credential.fullName?.familyName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  try {
    const res = await fetch(`${API_BASE}/api/auth/apple`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode ?? undefined,
        nonce,
        fullName: fullName || undefined,
      }),
    });
    const body = (await res
      .json()
      .catch(() => ({}))) as { token?: string; error?: string };
    if (!res.ok || !body.token) {
      // The status separates "Apple's token was rejected" (401) from "the
      // account couldn't be created" (500), which read identically otherwise.
      return {
        ok: false,
        cancelled: false,
        message: `${body.error ?? "Couldn't sign you in."} (${res.status})`,
      };
    }
    await saveToken(body.token);
    return { ok: true };
  } catch {
    return {
      ok: false,
      cancelled: false,
      message: "Couldn't reach paisa. Check your connection.",
    };
  }
}

/**
 * Attach an Apple ID to the account already signed in.
 *
 * Signing in with Apple never joins itself to an existing account — Apple's
 * relay addresses match nothing, and a shared real address would let whoever
 * holds that Apple ID into someone else's data. So the join has to be made from
 * inside the account, and this is that: same Apple sheet, same server-issued
 * nonce, but the request carries the current session and links rather than
 * signs in. Afterwards, signing in with Apple lands in this account.
 */
export async function linkAppleId(token: string): Promise<SignInResult> {
  if (!(await isAppleSignInAvailable())) {
    return {
      ok: false,
      cancelled: false,
      message: "Sign in with Apple isn't available on this device.",
    };
  }

  let nonce: string;
  try {
    const res = await fetch(`${API_BASE}/api/auth/apple/nonce`, {
      method: "POST",
    });
    if (!res.ok) {
      return {
        ok: false,
        cancelled: false,
        message: `Couldn't start (server ${res.status}).`,
      };
    }
    nonce = ((await res.json()) as { nonce: string }).nonce;
  } catch {
    return {
      ok: false,
      cancelled: false,
      message: "Couldn't reach paisa. Check your connection.",
    };
  }

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce,
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "ERR_REQUEST_CANCELED") return { ok: false, cancelled: true };
    return {
      ok: false,
      cancelled: false,
      message: `Apple didn't complete (${code ?? "no code"}).`,
    };
  }

  if (!credential.identityToken) {
    return {
      ok: false,
      cancelled: false,
      message: "Apple didn't return a token. Please try again.",
    };
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/apple/link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode ?? undefined,
        nonce,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !body.ok) {
      return {
        ok: false,
        cancelled: false,
        message: body.error ?? `Couldn't link (${res.status}).`,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      cancelled: false,
      message: "Couldn't reach paisa. Check your connection.",
    };
  }
}

/** Whether to show the button at all — iOS 13+ hardware only. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}
