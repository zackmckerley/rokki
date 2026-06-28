/**
 * Pure layout model for the rearrangeable dashboard panels (Week /
 * Tasks / Messages across two columns). DOM-free so it's unit-testable;
 * the React wiring (drag events, resize pointer math) lives in
 * components/dashboard/DashboardPanels.tsx.
 *
 * The user's arrangement persists per-device in localStorage — same
 * model as the explorer drag-reorder and the card collapse state. A
 * cross-device version would need a per-user column (a DB migration);
 * deferred until asked.
 */

export type DashColumn = "center" | "right";
export type DashLayout = { center: string[]; right: string[] };

/** The panels the dashboard knows how to place. Order here is the
 *  canonical fallback order (also the mobile stacking order). */
export const DASH_PANEL_IDS = [
  "week",
  "tasks",
  "messages",
  "markets",
  "goals",
  "contacts",
] as const;
export type DashPanelId = (typeof DASH_PANEL_IDS)[number];

export const DEFAULT_DASH_LAYOUT: DashLayout = {
  center: ["week", "tasks"],
  right: ["messages", "markets", "goals", "contacts"],
};

export const DASH_LAYOUT_STORAGE_KEY = "rokki:dash-panels";

/** Flatten both columns into a single ordered list (mobile order). */
export function flattenLayout(l: DashLayout): string[] {
  return [...l.center, ...l.right];
}

/**
 * Move `id` to `toCol` at position `toIdx`, removing it from wherever it
 * currently sits. Index is adjusted when moving down within the same
 * column so the drop lands where the user aimed. Returns a new object.
 */
export function movePanel(
  l: DashLayout,
  id: string,
  toCol: DashColumn,
  toIdx: number,
): DashLayout {
  const next: DashLayout = { center: [...l.center], right: [...l.right] };
  for (const c of ["center", "right"] as DashColumn[]) {
    const i = next[c].indexOf(id);
    if (i >= 0) {
      next[c].splice(i, 1);
      if (c === toCol && i < toIdx) toIdx--;
    }
  }
  const arr = next[toCol];
  arr.splice(Math.max(0, Math.min(toIdx, arr.length)), 0, id);
  return next;
}

/**
 * Coerce a possibly-stale/partial stored layout into a valid one:
 *   - drop ids that aren't known panels (a removed panel),
 *   - dedupe (a panel can't be in two places),
 *   - append any known panel that's missing (a newly added panel) to
 *     the center column, so nothing ever silently disappears.
 */
export function normalizeLayout(
  l: Partial<DashLayout> | null | undefined,
  ids: readonly string[] = DASH_PANEL_IDS,
): DashLayout {
  const known = new Set(ids);
  const seen = new Set<string>();
  const clean = (arr: unknown): string[] =>
    Array.isArray(arr)
      ? arr.filter(
          (x): x is string =>
            typeof x === "string" &&
            known.has(x) &&
            !seen.has(x) &&
            (seen.add(x), true),
        )
      : [];
  const center = clean(l?.center);
  const right = clean(l?.right);
  for (const id of ids) {
    if (!seen.has(id)) {
      center.push(id);
      seen.add(id);
    }
  }
  return { center, right };
}

/**
 * The grid-template-columns string for the two-column area.
 *   - both columns occupied → the user's split (centerFrac), with a 9px
 *     splitter track between.
 *   - one column empty → the occupied column takes the full width and
 *     the empty column + splitter collapse to 0 (Zack's request).
 *   - `forceTwo` (set while a panel is mid-drag) keeps both columns
 *     visible so an emptied column stays a reachable drop target.
 */
export function gridTemplate(
  layout: DashLayout,
  centerFrac: number,
  forceTwo = false,
): string {
  const cEmpty = layout.center.length === 0;
  const rEmpty = layout.right.length === 0;
  if (!forceTwo && rEmpty && !cEmpty) return "1fr 0 0";
  if (!forceTwo && cEmpty && !rEmpty) return "0 0 1fr";
  const c = Math.max(0.2, Math.min(0.8, centerFrac));
  return `${c}fr 9px ${1 - c}fr`;
}
