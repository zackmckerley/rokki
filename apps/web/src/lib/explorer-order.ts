/**
 * Pure ordering helpers for the left-rail Explorer's drag-to-reorder.
 *
 * The user's preferred order is stored per-device in localStorage as a
 * list of ids (spaces, or terminals within a space). These helpers apply
 * that saved order to the server-provided list and compute the new order
 * after a drag, with no React/DOM dependency so they're unit-testable in
 * isolation.
 *
 * Design choices:
 *   - Items NOT present in the saved order sink to the end in their
 *     original (server) order. So a brand-new space/terminal the user
 *     hasn't dragged yet shows up at the bottom rather than vanishing.
 *   - Ordering is stable: equal-rank items keep their original relative
 *     order.
 */

export const EXPLORER_SPACE_ORDER_KEY = "rokki_explorer_space_order";
export const EXPLORER_TERMINAL_ORDER_KEY = "rokki_explorer_terminal_order";

/** Sort `items` by the saved `order` of ids; unknown ids go last, stably. */
export function applyOrder<T>(
  items: T[],
  idOf: (x: T) => string,
  order: string[],
): T[] {
  // Defensive: a corrupt localStorage value could hand us a non-array. Coerce
  // rather than throw on `.map` mid-render (which white-screens the rail).
  if (!Array.isArray(order) || order.length === 0) return items;
  const pos = new Map(order.map((id, i) => [id, i] as const));
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const pa = pos.get(idOf(a.item)) ?? Number.POSITIVE_INFINITY;
      const pb = pos.get(idOf(b.item)) ?? Number.POSITIVE_INFINITY;
      // Saved rank first, then original index as a stable tiebreaker.
      return pa - pb || a.i - b.i;
    })
    .map((x) => x.item);
}

/**
 * Return a new id-array with `dragId` moved to just before `overId`.
 * If `overId` is null/unknown/equal to dragId, `dragId` goes to the end.
 * `dragId` not being in `ids` is tolerated (it's simply inserted).
 */
export function reorder(
  ids: string[],
  dragId: string,
  overId: string | null,
): string[] {
  const without = ids.filter((id) => id !== dragId);
  if (overId == null || overId === dragId) return [...without, dragId];
  const idx = without.indexOf(overId);
  if (idx === -1) return [...without, dragId];
  return [...without.slice(0, idx), dragId, ...without.slice(idx)];
}
