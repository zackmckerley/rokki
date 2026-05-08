/**
 * Tip-injection logic for the activity ticker.
 *
 * Sprinkles a "💡 Try: …" pseudo-row into the stream every 10th
 * slot so power users keep discovering MCP / shortcut features
 * without a dedicated card eating dashboard real estate.
 *
 * History:
 *   The original `(idx / 10) % tips.length` returned non-integer
 *   indices (0.9, 1.9, 2.9 at idx=9,19,29). `tips[0.9]` is
 *   `undefined`, which got pushed into the stream and crashed the
 *   renderer with `Cannot read properties of undefined (reading
 *   'id')` — see PR #119. The bug only manifested once a user's
 *   activity stream crossed 10 rows for the first time.
 *
 * Extracted from `TickerTape.tsx` so the index-rounding bug class
 * can be locked down by tests in isolation.
 */

export interface TickerTip {
  id: string;
  text: string;
  when: string;
  href?: string;
  /** Marks the row as a tip (vs. a real activity event). */
  tip?: boolean;
}

/**
 * Default tip list. The exported variable lets the caller swap in a
 * custom set (e.g. tests, alternate tip rotations) without forking
 * the injection logic.
 */
export const DEFAULT_TIPS: TickerTip[] = [
  {
    id: "tip:ask",
    text: `Try: "ask rokki what's in the permit folder" — ⌘K "ask"`,
    when: "",
    href: "/tools",
    tip: true,
  },
  {
    id: "tip:search",
    text: `Try: "search across all my files" — ⌘K "search"`,
    when: "",
    href: "/tools",
    tip: true,
  },
  {
    id: "tip:tool",
    text: `💡 Your tools are one keystroke away — ⌘K`,
    when: "",
    href: "/tools",
    tip: true,
  },
];

/**
 * Inject a tip every Nth row (default 10). Rotates through the
 * provided tip list. No-ops for short streams (< 5 items) so a quiet
 * user doesn't see tips outweigh real events.
 *
 * Defensive: integer-rounded index + falsy-skip means a malformed
 * tips list (or a future shape change) can't push undefined into
 * the stream.
 */
export function withToolTips<T extends { id: string }>(
  items: T[],
  tips: TickerTip[] = DEFAULT_TIPS,
  every: number = 10,
): (T | TickerTip)[] {
  if (items.length < 5 || tips.length === 0) return items;
  const out: (T | TickerTip)[] = [];
  items.forEach((it, idx) => {
    out.push(it);
    if ((idx + 1) % every === 0) {
      const tip = tips[Math.floor(idx / every) % tips.length];
      if (tip) out.push(tip);
    }
  });
  return out;
}
