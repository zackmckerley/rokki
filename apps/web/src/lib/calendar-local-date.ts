/**
 * Local-timezone date helpers for the calendar.
 *
 * The calendar loader (`calendar-queries.ts`) runs server-side, where the
 * runtime clock is UTC (Vercel). That means any date derived there with
 * `toISOString().slice(0,10)` — or a raw `starts_at` slice — is the *UTC*
 * calendar date, not the viewer's. For a Miami user (UTC-4/-5) an 8pm event
 * is stored `…T00:00:00Z` the next day, so it buckets and highlights on the
 * wrong day. These helpers key everything off the *browser's* local zone so
 * event buckets, grid cells, and the fetch window all agree.
 *
 * All functions are pure and have no React/DOM dependency so they can be unit
 * tested directly.
 */

/** `YYYY-MM-DD` from a Date's LOCAL components (never UTC). */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Re-derive a calendar item's bucket `date` in the browser's local zone.
 *
 * Timed events carry `date` computed server-side in UTC, so they must be
 * re-keyed from the raw timestamp on the client. All-day events and due-tasks
 * already carry a literal `YYYY-MM-DD` (never a wall-clock instant) and must
 * NOT be re-parsed — running them through `new Date()` would shift them a day.
 */
export function localizeItemDate<
  T extends { kind: string; all_day: boolean; when: string; date: string },
>(it: T): T {
  if (it.kind === "event" && !it.all_day && it.when.includes("T")) {
    return { ...it, date: localDateKey(new Date(it.when)) };
  }
  return it;
}

/**
 * Snap a bare `YYYY-MM-DD` back to the Sunday that starts its week, matching
 * the month grid (which is Sunday-first). Operates purely on the date parts,
 * so it is timezone-independent and safe to call on server or client.
 */
export function weekStartLocal(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() - dt.getDay()); // getDay(): 0 = Sunday
  return localDateKey(dt);
}
