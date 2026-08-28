import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { API_BASE, saveToken } from "./api";

/**
 * Sign in with Google, brokered through the paisa. backend.
 *
 * The app never talks to Google directly. Google will not register an `exp://`
 * redirect (a custom scheme needs a dot, and loopback is deprecated on mobile),
 * and Expo's proxy that used to bridge that gap was withdrawn over a
 * credential-theft flaw. So the browser goes to our server, which runs the same
 * Google flow the website uses and sends the result back to this app.
 *
 * The bearer token never travels in the redirect URL — deep links end up in
 * system logs — so we receive a short-lived one-time code and trade it for the
 * token over HTTPS.
 *
 * Works unchanged in Expo Go (exp:// return) and in a real build
 * (com.saniakothari.paisa:// return); only the return URL differs.
 */
/**
 * Connect Gmail without leaving the app.
 *
 * Previously this opened the website and left the person to find their way
 * back. Same consent screen, but it returns here when it's done.
 *
 * The browser carries no bearer token, so the app first trades its token for a
 * short-lived ticket over HTTPS; only the ticket goes in the URL.
 */
export async function connectGmail(token: string): Promise<SignInResult> {
  const returnUrl = Linking.createURL("gmail");

  let ticket: string;
  try {
    const res = await fetch(`${API_BASE}/api/mobile/gmail-ticket`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { ok: false, cancelled: false, message: "Couldn't start the connection." };
    }
    ticket = ((await res.json()) as { ticket: string }).ticket;
  } catch {
    return {
      ok: false,
      cancelled: false,
      message: "Couldn't reach paisa. Check your connection.",
    };
  }

  const start =
    `${API_BASE}/api/auth/google/connect-start` +
    `?ticket=${encodeURIComponent(ticket)}&return=${encodeURIComponent(returnUrl)}`;

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(start, returnUrl);
  } catch (e) {
    return {
      ok: false,
      cancelled: false,
      message: e instanceof Error ? e.message : "Couldn't open Google.",
    };
  }
  if (result.type !== "success") return { ok: false, cancelled: true };

  const params = Linking.parse(result.url).queryParams ?? {};
  if (typeof params.error === "string") {
    return { ok: false, cancelled: false, message: params.error };
  }
  if (params.connected !== "1") {
    return { ok: false, cancelled: false, message: "Connection didn't complete." };
  }
  return { ok: true };
}

export type SignInResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

export async function signInWithGoogle(): Promise<SignInResult> {
  const returnUrl = Linking.createURL("auth");
  const start = `${API_BASE}/api/auth/mobile/start?return=${encodeURIComponent(returnUrl)}`;

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(start, returnUrl);
  } catch (e) {
    return {
      ok: false,
      cancelled: false,
      message: e instanceof Error ? e.message : "Couldn't open the sign-in page.",
    };
  }

  // Dismissing the sheet is a choice, not a failure — don't show an error.
  if (result.type !== "success") return { ok: false, cancelled: true };

  const params = Linking.parse(result.url).queryParams ?? {};
  const error = typeof params.error === "string" ? params.error : null;
  if (error) return { ok: false, cancelled: false, message: error };

  const code = typeof params.code === "string" ? params.code : null;
  if (!code) {
    return { ok: false, cancelled: false, message: "Sign-in didn't complete." };
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/mobile/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return {
        ok: false,
        cancelled: false,
        message: body?.error ?? "Couldn't finish signing in.",
      };
    }
    const { token } = (await res.json()) as { token?: string };
    if (!token) {
      return { ok: false, cancelled: false, message: "No token was returned." };
    }
    await saveToken(token);
    return { ok: true };
  } catch {
    return {
      ok: false,
      cancelled: false,
      message: "Couldn't reach paisa. Check your connection.",
    };
  }
}
