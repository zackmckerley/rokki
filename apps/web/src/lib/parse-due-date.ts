/**
 * Natural-language date parser for the inline due-date chip in the
 * task composer.
 *
 * Returns the resolved date as a `YYYY-MM-DD` string in the user's
 * local calendar, or `null` if the input doesn't match any known
 * shape. Empty / whitespace-only input also returns `null`.
 *
 * Supported shapes:
 *   - "today"
 *   - "tomorrow" / "tmrw" / "tom"
 *   - "yesterday"
 *   - day of week: "fri", "friday", "mon", "monday" → next occurrence
 *     (today is *not* counted; "fri" on a Friday means next Friday)
 *   - "next <day>": forces the next-week occurrence even when the
 *     short form would otherwise be sooner
 *   - "in 3d", "in 2 weeks", "in 1m" (days/weeks/months)
 *   - "eow" (end of work week → Friday), "eom" (end of month)
 *   - YYYY-MM-DD, M/D, M/D/YY, M/D/YYYY
 *
 * Case-insensitive. Trims whitespace.
 */
export function parseDueDate(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  const today = startOfDay(new Date());

  // Single-word shortcuts.
  if (s === "today" || s === "now") return toISODate(today);
  if (s === "tomorrow" || s === "tmrw" || s === "tom") {
    return toISODate(addDays(today, 1));
  }
  if (s === "yesterday") return toISODate(addDays(today, -1));
  if (s === "eow") {
    // End of work week — Friday. If today is Sat/Sun, go to next Fri.
    const dow = today.getDay();
    const delta = dow <= 5 ? 5 - dow : 7 - dow + 5;
    return toISODate(addDays(today, delta));
  }
  if (s === "eom") {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return toISODate(d);
  }

  // Day of week (with optional "next " prefix).
  let dayKey = s;
  let forceNextWeek = false;
  if (dayKey.startsWith("next ")) {
    forceNextWeek = true;
    dayKey = dayKey.slice(5).trim();
  }
  const targetDow = DAY_OF_WEEK[dayKey];
  if (targetDow !== undefined) {
    const dow = today.getDay();
    let delta = (targetDow - dow + 7) % 7;
    // "fri" on a Friday means *next* Friday — same-day today isn't
    // a useful default for a due date.
    if (delta === 0) delta = 7;
    if (forceNextWeek && delta < 7) delta += 7;
    return toISODate(addDays(today, delta));
  }

  // "in 3d" / "in 2 weeks" / "in 1m"
  const inMatch = s.match(/^in\s+(\d+)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|mos|month|months)$/);
  if (inMatch) {
    const n = Number(inMatch[1]);
    const unit = inMatch[2];
    if (unit.startsWith("d")) return toISODate(addDays(today, n));
    if (unit.startsWith("w")) return toISODate(addDays(today, n * 7));
    if (unit.startsWith("m")) {
      return toISODate(addMonths(today, n));
    }
  }

  // "3d" / "2w" — bare delta without "in"
  const bareMatch = s.match(/^(\d+)\s*(d|w|m)$/);
  if (bareMatch) {
    const n = Number(bareMatch[1]);
    const unit = bareMatch[2];
    if (unit === "d") return toISODate(addDays(today, n));
    if (unit === "w") return toISODate(addDays(today, n * 7));
    if (unit === "m") {
      return toISODate(addMonths(today, n));
    }
  }

  // YYYY-MM-DD (already canonical — pad and validate).
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return formatYMDChecked(Number(y), Number(m), Number(d));
  }

  // M/D or M/D/YY or M/D/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const [, mm, dd, yy] = slashMatch;
    const year = yy
      ? yy.length === 2
        ? 2000 + Number(yy)
        : Number(yy)
      : today.getFullYear();
    return formatYMDChecked(year, Number(mm), Number(dd));
  }

  return null;
}

const DAY_OF_WEEK: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Add `n` months, clamping the day so Jan 31 + 1m → Feb 28/29, not Mar 3. */
function addMonths(d: Date, n: number): Date {
  const day = d.getDate();
  const r = new Date(d);
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const daysInMonth = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, daysInMonth));
  return r;
}

/** formatYMD, but rejects out-of-range / impossible dates (13/45, Feb 30) → null. */
function formatYMDChecked(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (!Number.isInteger(d) || d < 1) return null;
  const daysInMonth = new Date(y, m, 0).getDate();
  if (d > daysInMonth) return null;
  return formatYMD(y, m, d);
}

/**
 * Format a Date as `YYYY-MM-DD` using the *local* calendar — not
 * UTC. `Date.toISOString()` would convert to UTC first, which can
 * shift the date by a day for users east of GMT in the morning or
 * west of GMT in the evening.
 */
function toISODate(d: Date): string {
  return formatYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function formatYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Render a YYYY-MM-DD date as a short human label for the chip — the
 * inverse of `parseDueDate` for display purposes. Examples:
 *   today     "today"
 *   tomorrow  "tomorrow"
 *   +2..6 days "fri", "mon", etc.
 *   anything else  "May 14"
 */
export function formatDueLabel(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, y, mm, dd] = m;
  const target = startOfDay(new Date(Number(y), Number(mm) - 1, Number(dd)));
  const today = startOfDay(new Date());
  const delta = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta === -1) return "yesterday";
  if (delta > 1 && delta <= 6) {
    return [
      "sun",
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
    ][target.getDay()];
  }
  return target.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
