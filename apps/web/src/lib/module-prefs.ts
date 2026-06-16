/**
 * Pure preferences model for the dashboard's MODULES shelf — the thing the
 * "Modules settings" gear (in the explorer rail's MODULES header) edits.
 *
 * DOM-free and side-effect-free so it's exhaustively unit-testable; the
 * React wiring (provider, localStorage, server sync) lives in
 * components/dashboard/module-prefs.tsx, and the UI in ModuleSettings.tsx.
 *
 * The eight settings this model backs:
 *   1. Show / hide each module          → `hidden`
 *   2. Reorder modules                  → `order`
 *   3. Open vs. minimized by default    → `minimized`
 *   4. Reset to defaults                → resetModulePrefs()
 *   5. Default layout (stacked/split)   → `layout` (+ presetToDashLayout)
 *   6. Collapse MODULES section default → `sectionCollapsed`
 *   7. Sync across devices              → `sync`
 *   8. Add / remove from the catalog    → same `hidden` mechanism (a removed
 *                                          module is hidden; re-add = un-hide)
 */

export interface ModuleCatalogItem {
  id: string;
  label: string;
}

/**
 * The catalog of dashboard modules. The `id` matches the DashboardPanels
 * panel id and the dashboard-layout panel id; `label` is what the rail and
 * settings show. Grows over time (Goals, Files, …) — every consumer derives
 * from this list, so adding one here is the only change needed.
 */
export const MODULE_CATALOG: readonly ModuleCatalogItem[] = [
  { id: "week", label: "Schedule" },
  { id: "tasks", label: "Tasks" },
  { id: "messages", label: "Messages" },
  { id: "markets", label: "Markets" },
  { id: "goals", label: "Goals" },
];

export const MODULE_IDS: readonly string[] = MODULE_CATALOG.map((m) => m.id);

export const MODULE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  MODULE_CATALOG.map((m) => [m.id, m.label]),
);

/** Default panel arrangement applied on load (setting #5). */
export type DashLayoutPreset = "stacked" | "split";
export const LAYOUT_PRESETS: readonly DashLayoutPreset[] = ["stacked", "split"];

export interface ModulePrefs {
  /** Display order — drives the rail list and the default panel order (#2). */
  order: string[];
  /** Modules removed from the shelf: not in the rail or the panels (#1/#8). */
  hidden: string[];
  /** Modules that start minimized (parked in the rail) rather than open (#3).
   *  Also the live minimized state — toggling persists, so it *is* the
   *  per-device default for the next load. */
  minimized: string[];
  /** Default two-column arrangement (#5). */
  layout: DashLayoutPreset;
  /** Start the rail's MODULES section collapsed (#6). */
  sectionCollapsed: boolean;
  /** Persist server-side (profiles.preferences.modules) vs. per-device (#7). */
  sync: boolean;
}

export const MODULE_PREFS_STORAGE_KEY = "rokki:module-prefs";
/** Pre-#43 key: a bare array of minimized ids. Migrated on first load. */
export const LEGACY_MINIMIZED_KEY = "rokki:dash-minimized-modules";

export const DEFAULT_LAYOUT: DashLayoutPreset = "split";

/** A fresh defaults object. Returns a new instance each call (no shared
 *  mutable arrays), so callers can safely mutate the result. */
export function defaultModulePrefs(): ModulePrefs {
  return {
    order: [...MODULE_IDS],
    hidden: [],
    minimized: [],
    layout: DEFAULT_LAYOUT,
    sectionCollapsed: false,
    sync: false,
  };
}

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */

function cleanIds(
  input: unknown,
  known: Set<string>,
  seen: Set<string>,
): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const x of input) {
    if (typeof x === "string" && known.has(x) && !seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

/**
 * Coerce a possibly-stale / partial / untrusted prefs object into a valid
 * one:
 *   - `order` is deduped, stripped of unknown ids, and any known id that's
 *     missing is appended in catalog order (a newly-added module never
 *     silently disappears);
 *   - `hidden` is the subset of known ids;
 *   - `minimized` is the subset of known ids, minus anything hidden (a
 *     hidden module isn't meaningfully "minimized");
 *   - `layout` is a valid preset or the default;
 *   - the booleans are real booleans.
 */
export function normalizeModulePrefs(
  input: Partial<ModulePrefs> | null | undefined,
  ids: readonly string[] = MODULE_IDS,
): ModulePrefs {
  const known = new Set(ids);

  const orderSeen = new Set<string>();
  const order = cleanIds(input?.order, known, orderSeen);
  for (const id of ids) if (!orderSeen.has(id)) order.push(id);

  const hidden = cleanIds(input?.hidden, known, new Set<string>());
  const hiddenSet = new Set(hidden);

  const minimized = cleanIds(input?.minimized, known, new Set<string>()).filter(
    (id) => !hiddenSet.has(id),
  );

  const layout: DashLayoutPreset =
    input?.layout === "stacked" || input?.layout === "split"
      ? input.layout
      : DEFAULT_LAYOUT;

  return {
    order,
    hidden,
    minimized,
    layout,
    sectionCollapsed: input?.sectionCollapsed === true,
    sync: input?.sync === true,
  };
}

/** Parse an unknown blob (localStorage / server JSON) into valid prefs. */
export function parseModulePrefs(
  raw: unknown,
  ids: readonly string[] = MODULE_IDS,
): ModulePrefs {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return normalizeModulePrefs(raw as Partial<ModulePrefs>, ids);
  }
  return normalizeModulePrefs(null, ids);
}

/** Extract a partial prefs patch from the legacy minimized-only storage
 *  (a bare array of ids), for one-time migration. */
export function migrateLegacyMinimized(raw: unknown): Partial<ModulePrefs> {
  if (Array.isArray(raw)) {
    return {
      minimized: raw.filter((x): x is string => typeof x === "string"),
    };
  }
  return {};
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

/** Ordered ids of modules that are NOT hidden — the rail/panel set. */
export function activeModuleIds(
  prefs: ModulePrefs,
  ids: readonly string[] = MODULE_IDS,
): string[] {
  const known = new Set(ids);
  const hidden = new Set(prefs.hidden);
  return prefs.order.filter((id) => known.has(id) && !hidden.has(id));
}

/** Catalog items for the visible modules, in display order. */
export function orderedVisibleModules(
  prefs: ModulePrefs,
  catalog: readonly ModuleCatalogItem[] = MODULE_CATALOG,
): ModuleCatalogItem[] {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  return activeModuleIds(
    prefs,
    catalog.map((m) => m.id),
  )
    .map((id) => byId.get(id))
    .filter((m): m is ModuleCatalogItem => !!m);
}

/** Catalog items that are currently hidden — the "add back" tray (#8). */
export function hiddenModules(
  prefs: ModulePrefs,
  catalog: readonly ModuleCatalogItem[] = MODULE_CATALOG,
): ModuleCatalogItem[] {
  const hidden = new Set(prefs.hidden);
  // Catalog order, not `order`, so the tray is stable.
  return catalog.filter((m) => hidden.has(m.id));
}

export function isHidden(prefs: ModulePrefs, id: string): boolean {
  return prefs.hidden.includes(id);
}

export function isMinimized(prefs: ModulePrefs, id: string): boolean {
  return prefs.minimized.includes(id);
}

/** A module is "open by default" when it's neither hidden nor minimized. */
export function isOpenByDefault(prefs: ModulePrefs, id: string): boolean {
  return !prefs.hidden.includes(id) && !prefs.minimized.includes(id);
}

/** Ids that should be minimized on load — the live minimized set, scoped to
 *  modules that are actually active (a hidden module isn't minimized). */
export function initialMinimized(
  prefs: ModulePrefs,
  ids: readonly string[] = MODULE_IDS,
): string[] {
  const active = new Set(activeModuleIds(prefs, ids));
  return prefs.minimized.filter((id) => active.has(id));
}

/* ------------------------------------------------------------------ */
/* Mutators (pure — each returns a new prefs object)                   */
/* ------------------------------------------------------------------ */

/** #1/#8 — hide a module (remove from the shelf). Also clears its minimized
 *  flag, since a hidden module has no live state. No-op if already hidden. */
export function hideModule(prefs: ModulePrefs, id: string): ModulePrefs {
  if (!MODULE_IDS.includes(id) || prefs.hidden.includes(id)) return prefs;
  return {
    ...prefs,
    hidden: [...prefs.hidden, id],
    minimized: prefs.minimized.filter((m) => m !== id),
  };
}

/** #1/#8 — show a module (return it to the shelf). No-op if already shown. */
export function showModule(prefs: ModulePrefs, id: string): ModulePrefs {
  if (!prefs.hidden.includes(id)) return prefs;
  return { ...prefs, hidden: prefs.hidden.filter((h) => h !== id) };
}

export function setModuleHidden(
  prefs: ModulePrefs,
  id: string,
  hidden: boolean,
): ModulePrefs {
  return hidden ? hideModule(prefs, id) : showModule(prefs, id);
}

export function toggleModuleHidden(prefs: ModulePrefs, id: string): ModulePrefs {
  return setModuleHidden(prefs, id, !isHidden(prefs, id));
}

/**
 * #2 — move `id` so it lands at `toIndex` among the other modules (i.e. the
 * insertion index AFTER the module has been pulled out of its current spot).
 * Index is clamped to the valid range. No-op for an unknown id.
 */
export function moveModule(
  prefs: ModulePrefs,
  id: string,
  toIndex: number,
): ModulePrefs {
  const cur = prefs.order.indexOf(id);
  if (cur < 0) return prefs;
  const order = [...prefs.order];
  order.splice(cur, 1);
  const idx = Math.max(0, Math.min(Math.trunc(toIndex), order.length));
  order.splice(idx, 0, id);
  // No-op guard: if nothing changed, keep the same reference.
  if (order.every((v, i) => v === prefs.order[i])) return prefs;
  return { ...prefs, order };
}

/** #2 — nudge a module up (delta<0) or down (delta>0) by N slots. Clamped:
 *  nudging the first module up (or the last down) is a no-op. */
export function moveModuleBy(
  prefs: ModulePrefs,
  id: string,
  delta: number,
): ModulePrefs {
  const cur = prefs.order.indexOf(id);
  if (cur < 0) return prefs;
  const target = cur + Math.trunc(delta);
  if (target < 0 || target >= prefs.order.length) return prefs;
  return moveModule(prefs, id, target);
}

/** #3 — set a module's minimized (parked) state. No-op for hidden ids. */
export function setModuleMinimized(
  prefs: ModulePrefs,
  id: string,
  minimized: boolean,
): ModulePrefs {
  if (!MODULE_IDS.includes(id) || prefs.hidden.includes(id)) return prefs;
  const has = prefs.minimized.includes(id);
  if (minimized && !has) {
    return { ...prefs, minimized: [...prefs.minimized, id] };
  }
  if (!minimized && has) {
    return { ...prefs, minimized: prefs.minimized.filter((m) => m !== id) };
  }
  return prefs;
}

export function toggleModuleMinimized(
  prefs: ModulePrefs,
  id: string,
): ModulePrefs {
  return setModuleMinimized(prefs, id, !isMinimized(prefs, id));
}

/** #3 — "open by default" is the inverse of minimized. */
export function setModuleOpenByDefault(
  prefs: ModulePrefs,
  id: string,
  open: boolean,
): ModulePrefs {
  return setModuleMinimized(prefs, id, !open);
}

/** #5 — choose the default layout preset. */
export function setLayoutPreset(
  prefs: ModulePrefs,
  layout: DashLayoutPreset,
): ModulePrefs {
  if (layout !== "stacked" && layout !== "split") return prefs;
  if (prefs.layout === layout) return prefs;
  return { ...prefs, layout };
}

/** #6 — collapse/expand the MODULES rail section by default. */
export function setSectionCollapsed(
  prefs: ModulePrefs,
  collapsed: boolean,
): ModulePrefs {
  if (prefs.sectionCollapsed === collapsed) return prefs;
  return { ...prefs, sectionCollapsed: collapsed };
}

/** #7 — toggle cross-device sync. */
export function setSync(prefs: ModulePrefs, sync: boolean): ModulePrefs {
  if (prefs.sync === sync) return prefs;
  return { ...prefs, sync };
}

/** #4 — reset to defaults. Preserves the sync choice by default (resetting
 *  your layout shouldn't silently disconnect you from your other devices). */
export function resetModulePrefs(
  prev?: ModulePrefs,
  opts: { keepSync?: boolean } = { keepSync: true },
): ModulePrefs {
  const base = defaultModulePrefs();
  if (prev && opts.keepSync) base.sync = prev.sync;
  return base;
}

/* ------------------------------------------------------------------ */
/* Layout mapping (#5)                                                 */
/* ------------------------------------------------------------------ */

export interface DashLayoutColumns {
  center: string[];
  right: string[];
}

/**
 * Map a layout preset + the active (ordered, visible) module ids to the
 * two-column DashLayout the panels consume.
 *   - "stacked" → everything in one (center) column, full width;
 *   - "split"   → first half (rounded up) in center, the rest in the right
 *                 column. For the default 3 modules that's
 *                 center:[week,tasks], right:[messages].
 */
export function presetToDashLayout(
  layout: DashLayoutPreset,
  activeIds: string[],
): DashLayoutColumns {
  if (layout === "stacked") {
    return { center: [...activeIds], right: [] };
  }
  const cut = Math.ceil(activeIds.length / 2);
  return { center: activeIds.slice(0, cut), right: activeIds.slice(cut) };
}

/** Convenience: the DashLayout for a whole prefs object (#5 applied to the
 *  current active set). */
export function dashLayoutForPrefs(
  prefs: ModulePrefs,
  ids: readonly string[] = MODULE_IDS,
): DashLayoutColumns {
  return presetToDashLayout(prefs.layout, activeModuleIds(prefs, ids));
}

/* ------------------------------------------------------------------ */
/* Serialization / sync helpers (#7)                                   */
/* ------------------------------------------------------------------ */

/** A normalized plain object safe to JSON-stringify for localStorage or the
 *  server (profiles.preferences.modules). */
export function serializeModulePrefs(prefs: ModulePrefs): ModulePrefs {
  return normalizeModulePrefs(prefs);
}

/** True when two prefs objects are value-equal (order matters for `order`
 *  and `minimized`, set-equality for `hidden`). Used to skip redundant
 *  writes. */
export function modulePrefsEqual(a: ModulePrefs, b: ModulePrefs): boolean {
  const arrEq = (x: string[], y: string[]) =>
    x.length === y.length && x.every((v, i) => v === y[i]);
  const setEq = (x: string[], y: string[]) => {
    if (x.length !== y.length) return false;
    const s = new Set(x);
    return y.every((v) => s.has(v));
  };
  return (
    arrEq(a.order, b.order) &&
    setEq(a.hidden, b.hidden) &&
    arrEq(a.minimized, b.minimized) &&
    a.layout === b.layout &&
    a.sectionCollapsed === b.sectionCollapsed &&
    a.sync === b.sync
  );
}
