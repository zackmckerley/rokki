/**
 * Normalize a caller-provided list of email addresses for storage on
 * `tasks.external_assignee_emails`.
 *
 * Trims, lower-cases, dedupes, and shape-validates each entry.
 * Returns the canonical list, or the literal string `"invalid"` when
 * any entry fails the basic regex (which the API surfaces as a 400).
 *
 * Empty / whitespace-only entries are silently dropped so a stale UI
 * chip can't accidentally poison the row.
 *
 * Validation is intentionally permissive — anything with a local
 * part, an `@`, and a TLD-shaped domain. Deeper validation
 * (existence, deliverability) belongs in the invite-email step, not
 * here. We only care that what lands on the row is at least the
 * shape of an email.
 */
export function normalizeEmails(input: unknown): string[] | "invalid" {
  if (!Array.isArray(input)) return "invalid";
  const out = new Set<string>();
  const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const v = raw.trim().toLowerCase();
    if (!v) continue;
    if (!re.test(v)) return "invalid";
    out.add(v);
  }
  return Array.from(out);
}
