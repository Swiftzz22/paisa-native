import { Platform } from "react-native";

/**
 * Night Ledger: midnight navy lit from behind by the rupee blue of the app
 * icon. The web landing uses the same values, so keep the two in step.
 *
 * `card`, `card2` and `border` are the glass values below already blended onto
 * `bg`. Sheets and modals sit on top of other content, so a see-through card
 * there would show the screen underneath; the solid blend looks identical
 * against plain `bg`. Use `glass`/`glassEdge` only over `NightBackground`,
 * where the glow is meant to show through.
 */
export const C = {
  bg: "#070b16",
  card: "#131722",
  card2: "#1b1f29",
  border: "#1d212b",
  glass: "rgba(255,255,255,0.05)",
  glassEdge: "rgba(255,255,255,0.09)",
  text: "#e9efff",
  muted: "#8792ad",
  subtle: "#6b7590",
  green: "#4ade80",
  greenBg: "rgba(74,222,128,0.15)",
  red: "#f87171",
  redBg: "rgba(248,113,113,0.15)",
  accent: "#3b82f6",
  /** The bright edge of the glow: the ₹ glyph, highlights, the active dot. */
  highlight: "#7ab0ff",
  /** Fill behind the glowing ₹ and other icon badges: navy tipped toward the blue. */
  badge: "#13203d",
};

/** Amounts are set in mono so columns of figures line up digit for digit. */
export const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

/**
 * Nested corners share a centre.
 *
 * When a rounded box sits inside another, the gap between their edges has to be
 * constant all the way around, or the corners visibly diverge — the inner curve
 * either crowds the outer one or drifts away from it, and the pair reads as two
 * unrelated shapes. Keeping them concentric is what makes a card look like it
 * contains its contents rather than merely overlapping them.
 *
 * The rule is one subtraction: inner = outer − gap.
 *
 *   radius: concentric(R.card, SPACE.card)   // instead of a guessed number
 *
 * Written as a call rather than a literal so the relationship survives. Every
 * pair here had been hand-computed once and then drifted — a track of 12 with
 * padding 4 around a thumb of 9, which is off by one and reads as a wobble at
 * the corner.
 */
export function concentric(outer: number, gap: number): number {
  // A gap wider than the outer radius means the inner corner has curved past
  // straight. Apple's answer is a square corner, and clamping is what produces
  // it — but it is nearly always a sign the container's radius is too small for
  // its own padding, so prefer widening the container over landing here.
  return Math.max(0, outer - gap);
}

/**
 * Radii, chosen so the common nestings come out whole.
 *
 * `card - space.card` is 12, which is why every field, row and nested block in
 * the app is 12: they are all one gap in from a card edge. Changing `card`
 * without changing those together breaks the alignment.
 */
export const SPACE = {
  /**
   * Padding inside a card — the gap that sets every inner radius.
   *
   * 16 rather than the 20 the cards used, so that one card radius works for
   * both the padded cards and the settings lists whose rows run edge to edge.
   * A larger padding would have forced a larger radius still, and a radius big
   * enough for 20 starts clipping the first row of an edge-to-edge list.
   */
  card: 16,
  /** Padding inside a segmented track, around its thumb. */
  track: 4,
} as const;

export const R = {
  /** Cards and sheets. Large enough that a real radius survives one padding. */
  card: 28,
  /** Standalone controls sitting on the background, nested in nothing. */
  control: 14,
  /** Fully round: pills, progress tracks, avatars. */
  pill: 999,
} as const;

/**
 * One card-padding inside a card: fields, nested blocks, inline buttons.
 * Derived rather than written down, so it cannot drift from `R.card`.
 */
export const R_INNER = concentric(R.card, SPACE.card);

/** The thumb of a segmented control, one track-padding inside it. */
export const R_THUMB = concentric(R.control, SPACE.track);
