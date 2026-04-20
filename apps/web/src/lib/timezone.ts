/**
 * Timezone helpers. Profiles carry an optional IANA timezone
 * (`America/New_York` etc.). The dashboard auto-detects and saves on first
 * sign-in. UI uses it to show "Maria · 3:12pm (Mexico City)" next to names
 * so scheduling doesn't blow up across time zones.
 */

/** Detect the browser's IANA timezone. Returns null if the API is absent. */
export function detectClientTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * Format the current time in a given IANA timezone, e.g. "3:12pm".
 * Returns null if the timezone is unknown to the runtime.
 */
export function currentTimeIn(tz: string | null | undefined): string | null {
  if (!tz) return null;
  try {
    const now = new Date();
    return now.toLocaleTimeString(undefined, {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

/**
 * Short city/region label for display — drop the continent prefix.
 *   "America/New_York" → "New York"
 */
export function shortZoneLabel(tz: string | null | undefined): string | null {
  if (!tz) return null;
  const parts = tz.split("/");
  const tail = parts[parts.length - 1] ?? tz;
  return tail.replace(/_/g, " ");
}
