/**
 * Week boundary helpers for the Goals module.
 *
 * Ported from `Claude/rokki-goals/lib/week.ts`. Returns YYYY-MM-DD
 * strings so they slot directly into Postgres DATE columns and
 * SQL inequalities (`.gte("entry_date", weekStart)`).
 *
 * Week starts on Monday by convention; that matches both the
 * standalone Goals app and `MODULE_PLAN.md §1.3`. Settings can
 * override later (`goals_settings.week_start_dow`); the per-scope
 * loader will inject the right value when that becomes wired.
 */

/** Default week start — Monday. 0 = Sunday, 1 = Monday, …, 6 = Saturday. */
export const DEFAULT_WEEK_START_DOW = 1;

/**
 * First date (inclusive) of the week containing `iso`. Returns
 * YYYY-MM-DD. Pure date math — no timezone conversions, so a date
 * close to midnight UTC and the user's local Monday line up the
 * way an ISO-date column expects.
 */
export function startOfWeek(
  iso: string,
  weekStartDow: number = DEFAULT_WEEK_START_DOW,
): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const dow = date.getUTCDay();
  const diff = (dow - weekStartDow + 7) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

/**
 * Last date (inclusive) of the week containing `iso`. Wraps
 * `startOfWeek` + 6 days.
 */
export function endOfWeek(
  iso: string,
  weekStartDow: number = DEFAULT_WEEK_START_DOW,
): string {
  const start = startOfWeek(iso, weekStartDow);
  const [y, m, d] = start.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

/** First day (inclusive) of the month containing `iso`. Returns YYYY-MM-01. */
export function startOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
}

/** Last day (inclusive) of the month containing `iso`. */
export function endOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  const d = new Date(Date.UTC(y, m ?? 1, 0));
  return d.toISOString().slice(0, 10);
}

export type GoalPeriodKind = "daily" | "weekly" | "monthly";

/**
 * The [start, end] window of the bucket that `iso` falls in for a given period
 * — a single day for daily, the Mon–Sun week for weekly, the calendar month for
 * monthly. `start` doubles as the canonical entry_date for that bucket.
 */
export function periodWindow(
  period: GoalPeriodKind,
  iso: string,
  weekStartDow: number = DEFAULT_WEEK_START_DOW,
): { start: string; end: string } {
  if (period === "weekly") {
    return { start: startOfWeek(iso, weekStartDow), end: endOfWeek(iso, weekStartDow) };
  }
  if (period === "monthly") {
    return { start: startOfMonth(iso), end: endOfMonth(iso) };
  }
  return { start: iso, end: iso };
}

/** A short label for the active period bucket, e.g. "This week" / "June". */
export function periodLabel(period: GoalPeriodKind, iso: string): string {
  if (period === "monthly") {
    const [y, m] = iso.split("-").map(Number);
    const d = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  }
  if (period === "weekly") return "This week";
  return "Today";
}

/**
 * Format the "week of" label for the UI. Returns
 * "Mon Aug 12 → Sun Aug 18" style.
 */
export function formatWeekLabel(
  weekStart: string,
  weekEnd: string,
): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };
  return `${fmt(weekStart)} → ${fmt(weekEnd)}`;
}
