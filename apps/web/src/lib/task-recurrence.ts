import type { TaskRecurrenceRule } from "@rokki/db";

/**
 * Reject anything that isn't shaped like our public TaskRecurrenceRule.
 *
 * The DB-level CHECK is permissive on purpose so the UI can grow new
 * fields without a migration each time. We do strict validation here at
 * the API edge so a bad payload returns 400 instead of a Postgres CHECK
 * violation 500.
 *
 * Returns:
 *   - the parsed rule on success
 *   - `null` if the caller is intentionally clearing the rule
 *   - the literal string "invalid" if the shape is wrong (so callers can
 *     pattern-match without exceptions)
 */
export function validateRecurrenceRule(
  value: unknown,
): TaskRecurrenceRule | null | "invalid" {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return "invalid";
  const v = value as Record<string, unknown>;
  if (v.pattern !== "daily" && v.pattern !== "weekly" && v.pattern !== "monthly")
    return "invalid";
  if (typeof v.interval !== "number" || !Number.isInteger(v.interval) || v.interval < 1)
    return "invalid";
  if (v.weekdays !== undefined) {
    if (
      !Array.isArray(v.weekdays) ||
      v.weekdays.some((d) => typeof d !== "number" || d < 0 || d > 6)
    )
      return "invalid";
  }
  if (v.end_date !== undefined && v.end_date !== null) {
    if (typeof v.end_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.end_date))
      return "invalid";
  }
  return v as unknown as TaskRecurrenceRule;
}
