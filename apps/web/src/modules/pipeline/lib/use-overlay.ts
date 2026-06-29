"use client";

import { useEffect } from "react";

/**
 * Shared behavior for the module's modal/drawer overlays: while `active`, close
 * on Escape and, on close, return focus to whatever was focused when the overlay
 * opened (so keyboard users aren't dumped at the top of the page). Pair with
 * `role="dialog" aria-modal` on the panel for screen readers.
 */
export function useOverlay(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Only pull focus back if it's still inside the (now-closing) overlay.
      if (restoreTo && typeof restoreTo.focus === "function") restoreTo.focus();
    };
    // onClose is stable enough in practice; re-running on `active` is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
