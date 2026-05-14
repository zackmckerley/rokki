/**
 * Shared types for the module-system pane shell.
 *
 * These mirror the DB-side shapes (`space_modules`, `terminal_modules`,
 * `modules_catalog`) but are intentionally smaller — only what the UI
 * actually needs to render tabs. Heavy queries / mutations stay on
 * the server side (in `actions/modules.ts` and the SDK).
 */
import type { ModuleScope } from "@rokki/sdk";

/**
 * The "where you are" in the rail. Drives the scope crumb at the top
 * of the pane and the scope of each tab strip.
 */
export type PaneScope =
  | { kind: "user"; label: string }
  | { kind: "space"; id: string; slug: string; label: string }
  | { kind: "terminal"; id: string; ticker: string; label: string };

/**
 * One installed module surfaced as a tab or in the overflow menu.
 */
export interface InstalledModuleEntry {
  /** Matches `modules_catalog.slug` and the manifest. */
  slug: string;
  /** Display name (from `modules_catalog.name`). */
  name: string;
  /** Lucide icon name. */
  icon: string;
  /** Scope this module is installed at — for rendering the route. */
  scope: ModuleScope;
  /** Per-user display order from `user_module_pins`, or default. */
  displayOrder: number;
  /** True when the entry is pinned (shown in tab strip). */
  pinned: boolean;
}

/**
 * Result of resolving installed modules + user pins for the current
 * scope. The shell renders `pinned` as tabs and `overflow` in the
 * `⋯ More` dropdown.
 */
export interface ResolvedModules {
  pinned: InstalledModuleEntry[];
  overflow: InstalledModuleEntry[];
}
