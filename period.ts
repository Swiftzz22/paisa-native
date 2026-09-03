import type { Period } from "./api";

/**
 * Stepping through periods on the device.
 *
 * The four tabs only ever described the period containing *now*, so a past
 * month could not be reached at all. These compute an arbitrary period and the
 * one before or after it, in the phone's own timezone — the server is told the
 * offset separately and agrees on the boundaries.
 */

export type PeriodWindow = {
  grain: Period;
  from: Date;
  to: Date;
  label: string;
  /** True when the window contains today; there is no "next" past it. */
  isCurrent: boolean;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** Monday-first, matching the web. */
function startOfWeek(d: Date): Date {
  const offset = (d.getDay() + 6) % 7;
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset));
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** The window of the given grain that contains `anchor`. */
export function windowFor(grain: Period, anchor: Date, now = new Date()): PeriodWindow {
  switch (grain) {
    case "day": {
      const from = startOfDay(anchor);
      const isToday = sameDay(anchor, now);
      return {
        grain,
        from,
        to: endOfDay(anchor),
        label: isToday
          ? "Today"
          : `${DAYS[anchor.getDay()]} ${anchor.getDate()} ${MONTHS[anchor.getMonth()].slice(0, 3)}`,
        isCurrent: isToday,
      };
    }
    case "week": {
      const from = startOfWeek(anchor);
      const to = endOfDay(
        new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6)
      );
      const label =
        from.getMonth() === to.getMonth()
          ? `${from.getDate()} – ${to.getDate()} ${MONTHS[to.getMonth()].slice(0, 3)}`
          : `${from.getDate()} ${MONTHS[from.getMonth()].slice(0, 3)} – ${to.getDate()} ${MONTHS[to.getMonth()].slice(0, 3)}`;
      return {
        grain,
        from,
        to,
        label,
        isCurrent: +startOfWeek(now) === +from,
      };
    }
    case "month": {
      const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const to = endOfDay(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
      return {
        grain,
        from,
        to,
        label: `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`,
        isCurrent:
          anchor.getFullYear() === now.getFullYear() &&
          anchor.getMonth() === now.getMonth(),
      };
    }
    case "year": {
      const from = new Date(anchor.getFullYear(), 0, 1);
      const to = endOfDay(new Date(anchor.getFullYear(), 11, 31));
      return {
        grain,
        from,
        to,
        label: String(anchor.getFullYear()),
        isCurrent: anchor.getFullYear() === now.getFullYear(),
      };
    }
  }
}

/** The same-sized window `step` places away (-1 back, +1 forward). */
export function shiftAnchor(grain: Period, anchor: Date, step: number): Date {
  switch (grain) {
    case "day":
      return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + step);
    case "week":
      return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + step * 7);
    case "month":
      // Anchored to the 1st so stepping out of a 31-day month into a shorter
      // one cannot roll over into the month after it.
      return new Date(anchor.getFullYear(), anchor.getMonth() + step, 1);
    case "year":
      return new Date(anchor.getFullYear() + step, 0, 1);
  }
}

/** YYYY-MM-DD in local time, matching the keys the server sends back. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
