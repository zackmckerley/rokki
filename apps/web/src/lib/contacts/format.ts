/**
 * Pure display helpers for the contacts UI — kept DOM-free + injectable-clock so
 * they're unit-testable.
 */

/** Compact "updated 3d ago" style relative time. `nowMs` is injectable for tests. */
export function timeAgo(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const sec = Math.round((nowMs - then) / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

/**
 * Format a `YYYY-MM-DD` birthday for display, e.g. "Mar 9" or "Mar 9, 1985".
 * Year-less is supported via the sentinel year `0000`. Parsed as a plain date
 * (no timezone shift) so it never lands on the wrong day.
 */
export function formatBirthday(date: string | null | undefined): string {
  if (!date) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return "";
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const base = `${MONTHS[month - 1]} ${day}`;
  return y === "0000" ? base : `${base}, ${y}`;
}
