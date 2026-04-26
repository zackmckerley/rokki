"use client";

import { useEffect } from "react";

/**
 * Diagnostic probe for "Escape kicks me out of Rokki" report.
 *
 * Mounted at the layout root. By default this is a no-op — the probe only
 * activates when the URL contains `?debug-escape=1` (or localStorage has
 * `rokki:debug-escape` set to "1"). When active, every Escape keypress
 * logs a structured snapshot to the console so we can see exactly:
 *
 *   - What URL was active
 *   - What element had focus
 *   - Which open dialogs were on screen (`[role="dialog"]` count)
 *   - Whether the event was preventDefault'd by another handler
 *   - The next URL after the keystroke (200ms later)
 *
 * Usage to reproduce:
 *   1. Open DevTools console.
 *   2. Append `?debug-escape=1` to the URL and hit Enter.
 *   3. Reproduce the bug.
 *   4. Copy the log lines into a bug report.
 *
 * The probe deliberately does not interfere with any other handler —
 * it only observes.
 */
export function EscapeProbe() {
  useEffect(() => {
    const enabled =
      new URLSearchParams(window.location.search).get("debug-escape") ===
        "1" || window.localStorage.getItem("rokki:debug-escape") === "1";
    if (!enabled) return;

    console.info(
      "[EscapeProbe] active — every Escape press will be logged to this console.",
    );

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      const dialogCount = document.querySelectorAll('[role="dialog"]').length;
      const snapshot = {
        url: window.location.href,
        defaultPrevented: e.defaultPrevented,
        activeTag: active?.tagName ?? null,
        activeId: (active as HTMLElement | null)?.id ?? null,
        activeAria:
          (active as HTMLElement | null)?.getAttribute("aria-label") ?? null,
        dialogsOpen: dialogCount,
        timestamp: new Date().toISOString(),
      };
      console.warn("[EscapeProbe] keydown:", snapshot);
      // Capture the URL 200ms later — if it changed, something handled
      // Escape by navigating.
      const before = window.location.href;
      window.setTimeout(() => {
        const after = window.location.href;
        if (after !== before) {
          console.warn("[EscapeProbe] navigation after Escape:", {
            from: before,
            to: after,
          });
        }
      }, 200);
    };

    // Use capture: true so we see Escape BEFORE any other handler can
    // call stopPropagation() on it.
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  return null;
}
