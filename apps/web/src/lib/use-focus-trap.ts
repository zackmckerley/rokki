import { useEffect, type RefObject } from "react";

/** Elements that participate in a focus trap (excludes tabindex="-1"). */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

function getFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => !el.hasAttribute("aria-hidden"));
}

/**
 * Trap keyboard focus within `panelRef` while `active`. Moves focus into the
 * panel on activate (unless a child already grabbed it via autoFocus), traps
 * Tab / Shift+Tab inside it, calls `onClose` on Escape, and restores focus to
 * the previously-focused element on deactivate. Mirrors the behavior of the
 * repo's Dialog primitive so overlays (Lightbox, pickers) behave consistently.
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Defer a tick so the panel is in the DOM; leave an autoFocus'd child alone.
    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      (getFocusables(panel)[0] ?? panel).focus?.();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = getFocusables(panel);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === first || !panel.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [active, onClose, panelRef]);
}
