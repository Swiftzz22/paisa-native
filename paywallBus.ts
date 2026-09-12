/**
 * One line from any refused request to the paywall sheet.
 *
 * A 402 can come from a statement import buried in a helper, from Ask, or from
 * a background sync — screens that share no ancestor worth threading a callback
 * through. Rather than give six components a prop they only forward, the API
 * layer announces the refusal here and the one sheet mounted at the root
 * listens.
 *
 * Deliberately tiny and synchronous: this is an event, not state. What is
 * actually true about someone's subscription lives on the server, and the app
 * re-reads it from the dashboard.
 */

type Listener = (reason: string) => void;

let listener: Listener | null = null;

/** Mounted once, at the root. A second registration replaces the first. */
export function onShowPaywall(fn: Listener | null): void {
  listener = fn;
}

/** Called by the API layer when the server answers 402. */
export function showPaywall(reason: string): void {
  listener?.(reason);
}
