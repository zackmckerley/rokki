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
