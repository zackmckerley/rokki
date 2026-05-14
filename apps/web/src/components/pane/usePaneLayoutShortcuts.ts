"use client";

import { useEffect } from "react";
import { isEditableTarget } from "@/lib/shortcuts";
import type { PaneLayout } from "./PaneArea";

/**
 * ⌘1 / ⌘2 / ⌘4 — switch pane layout. Mirrors the cmd-K convention
 * for global shortcuts: requires the meta/ctrl modifier so a bare
 * digit press inside a text field doesn't fight the user.
 *
 * Per `docs/08_UI_DESIGN.md §8.15.4`:
 *   ⌘1 → single
 *   ⌘2 → split-2
 *   ⌘4 → grid-4
 *
 * The caller owns `setLayout` so this hook stays free of routing or
 * persistence opinions. Phase 4.x will persist the choice
 * per-user via `localStorage` or settings; for now it's session-only.
 */
export function usePaneLayoutShortcuts(
  setLayout: (next: PaneLayout) => void,
): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      if (e.key === "1") {
        e.preventDefault();
        setLayout("single");
      } else if (e.key === "2") {
        e.preventDefault();
        setLayout("split-2");
      } else if (e.key === "4") {
        e.preventDefault();
        setLayout("grid-4");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setLayout]);
}
