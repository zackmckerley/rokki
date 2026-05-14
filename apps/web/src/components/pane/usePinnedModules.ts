"use client";

import { useMemo } from "react";
import type {
  InstalledModuleEntry,
  PaneScope,
  ResolvedModules,
} from "./types";

interface UsePinnedModulesArgs {
  /** All modules the scope has installed (from `space_modules` / `terminal_modules`). */
  installed: InstalledModuleEntry[];
  /** Current pane scope — used to namespace pin lookups by scope kind. */
  scope: PaneScope;
  /** Max tabs that fit in the strip. Surplus goes to overflow. Default 5. */
  maxPinned?: number;
}

/**
 * Split installed modules into pinned (in the tab strip) and overflow
 * (in the `⋯ More` dropdown).
 *
 * Phase 0 returns a straight first-N split with the existing pin
 * metadata applied. Phase 4 adds drag-to-reorder + per-user pin
 * writes to `user_module_pins`; this hook becomes the consumer of
 * that data.
 *
 * `scope` is currently unused at runtime — it's accepted so the
 * caller doesn't have to refactor when scope-aware bucketing lands.
 */
export function usePinnedModules({
  installed,
  scope: _scope,
  maxPinned = 5,
}: UsePinnedModulesArgs): ResolvedModules {
  return useMemo<ResolvedModules>(() => {
    // Stable ordering: pinned first (by display_order), then the rest
    // sorted likewise. Pinning surfaces what the user has chosen to
    // see at a glance; non-pinned still get a deterministic order
    // when they appear in the overflow.
    const sorted = [...installed].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.displayOrder - b.displayOrder;
    });
    const pinnedFromFlag = sorted.filter((m) => m.pinned);
    const rest = sorted.filter((m) => !m.pinned);

    // If too few are explicitly pinned, top up from the rest until we
    // hit `maxPinned`. Without this every fresh scope would render an
    // empty tab strip until the user opens the menu.
    const pinned = pinnedFromFlag.slice(0, maxPinned);
    let cursor = 0;
    while (pinned.length < maxPinned && cursor < rest.length) {
      pinned.push(rest[cursor]!);
      cursor += 1;
    }
    const overflow = [
      ...pinnedFromFlag.slice(maxPinned),
      ...rest.slice(cursor),
    ];
    return { pinned, overflow };
  }, [installed, maxPinned]);
}
