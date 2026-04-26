/**
 * Per-key diff between two jsonb objects.
 *
 * Used by the History tab on task/terminal/space detail pages and the Diff
 * column on /admin/activity to render before/after audit-log rows.
 *
 * Design choices:
 *   - Returns a flat list of `{ key, before, after }` so the renderer can
 *     decide how to display each field independently. We intentionally do
 *     not collapse nested objects into dotted paths here — most rows we
 *     audit are relatively flat (tasks, files, comments, terminals,
 *     spaces) and full-object replacement renders better than a dotted-key
 *     deep-merge view.
 *   - Stable sort by key so consecutive renders of the same diff don't
 *     reshuffle rows.
 *   - Uses JSON.stringify for value equality. Good enough because both
 *     sides come from `to_jsonb()` in Postgres, which gives canonical
 *     ordering for object keys.
 *   - Skips noisy bookkeeping fields that the trigger already strips
 *     (updated_at) plus a small set of "we don't display this" fields
 *     (search-tsv columns, embeddings) — defensive in case the trigger
 *     ever forwards them.
 */

export interface DiffEntry {
  /** Column name from the source table. */
  key: string;
  /** Value before the change, or `undefined` if this is a new key. */
  before: unknown;
  /** Value after the change, or `undefined` if this key was removed. */
  after: unknown;
}

/**
 * Columns that should never show up in a user-facing diff. These are either
 * trigger bookkeeping or large internal blobs that would explode the row.
 */
const HIDDEN_KEYS = new Set<string>([
  "updated_at",
  "content_tsv",
  "embedding",
  "wrapped_dek",
  "ciphertext",
  "iv",
  "tag",
]);

export function diffJson(
  before: unknown,
  after: unknown,
): DiffEntry[] {
  const a = toRecord(before);
  const b = toRecord(after);

  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  const entries: DiffEntry[] = [];

  for (const key of keys) {
    if (HIDDEN_KEYS.has(key)) continue;
    const av = a[key];
    const bv = b[key];
    if (jsonEqual(av, bv)) continue;
    entries.push({ key, before: av, after: bv });
  }

  entries.sort((x, y) => x.key.localeCompare(y.key));
  return entries;
}

function toRecord(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object") return {};
  if (Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  // Stable string compare. JSON.stringify on the output of Postgres'
  // to_jsonb() is canonical enough for our purposes (no class instances,
  // no Map/Set, no functions).
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Format a single jsonb value for display when we don't have a richer
 * renderer. Strings render bare; arrays/objects round-trip through
 * JSON.stringify; null shows as the literal "null" so a NULL-out is
 * visible.
 */
export function formatJsonValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Character-level diff for short string values (≤200 chars on each side).
 * Returns a list of segments tagged "added" / "removed" / "same" using a
 * trivial LCS — good enough for short titles, descriptions, and labels.
 *
 * For longer strings, callers should fall back to "from X to Y" rather
 * than spending DOM nodes on a per-character paint.
 */
export interface CharDiffSegment {
  type: "same" | "added" | "removed";
  text: string;
}

const MAX_CHAR_DIFF_LEN = 200;

export function shouldUseCharDiff(
  before: unknown,
  after: unknown,
): boolean {
  if (typeof before !== "string" || typeof after !== "string") return false;
  return before.length <= MAX_CHAR_DIFF_LEN && after.length <= MAX_CHAR_DIFF_LEN;
}

export function charDiff(before: string, after: string): CharDiffSegment[] {
  if (before === after) {
    return [{ type: "same", text: before }];
  }
  const lcs = lcsTable(before, after);
  // Walk the LCS table backwards to collect operations in reverse order, then
  // flip both the operation list AND the per-segment text so the final output
  // reads forwards.
  const reversed: CharDiffSegment[] = [];
  let i = before.length;
  let j = after.length;
  while (i > 0 && j > 0) {
    if (before[i - 1] === after[j - 1]) {
      prependChar(reversed, "same", before[i - 1]!);
      i--;
      j--;
    } else if (lcs[i - 1]![j]! >= lcs[i]![j - 1]!) {
      prependChar(reversed, "removed", before[i - 1]!);
      i--;
    } else {
      prependChar(reversed, "added", after[j - 1]!);
      j--;
    }
  }
  while (i > 0) {
    prependChar(reversed, "removed", before[--i]!);
  }
  while (j > 0) {
    prependChar(reversed, "added", after[--j]!);
  }
  return reversed;
}

function prependChar(
  segments: CharDiffSegment[],
  type: CharDiffSegment["type"],
  ch: string,
): void {
  const first = segments[0];
  if (first && first.type === type) {
    first.text = ch + first.text;
  } else {
    segments.unshift({ type, text: ch });
  }
}

function lcsTable(a: string, b: string): number[][] {
  const m = a.length;
  const n = b.length;
  const table: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        table[i]![j] = table[i - 1]![j - 1]! + 1;
      } else {
        table[i]![j] = Math.max(table[i - 1]![j]!, table[i]![j - 1]!);
      }
    }
  }
  return table;
}
