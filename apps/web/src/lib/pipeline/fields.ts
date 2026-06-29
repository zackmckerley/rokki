/**
 * Pure helpers for the pipeline field editor — turning a free-text label into a
 * stable, unique attribute key. DOM/IO-free + unit-tested.
 */

/** A safe attribute key from a label: lowercased, non-alphanumerics → `_`. */
export function slugifyKey(label: string): string {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return s || "field";
}

/** `base`, or `base_2`, `base_3`, … if already taken. */
export function uniqueKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
