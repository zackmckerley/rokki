"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Modal dialog primitive.
 *
 * a11y:
 *   - `role="dialog"` + `aria-modal` + `aria-labelledby` so screen readers
 *     announce the title and treat the rest of the page as inert.
 *   - On open, focus is moved into the panel (the first focusable child,
 *     or the close button as a fallback). The previously focused element
 *     is captured and restored on close — keyboard users land back where
 *     they triggered the dialog.
 *   - Tab and Shift+Tab are trapped within the panel so the user can't
 *     accidentally tab into the still-rendered page behind it.
 *   - Escape closes the dialog.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(
    `dialog-title-${Math.random().toString(36).slice(2, 9)}`,
  );

  // Capture the activator on open, restore on close. Without this, focus
  // goes to <body> after the dialog unmounts and keyboard users lose their
  // place entirely.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Defer one tick so the panel is in the DOM when we look for focusables.
    // If a child already grabbed focus via React `autoFocus`, leave it
    // alone — the caller chose the most useful target.
    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      if (panel.contains(document.activeElement)) return;
      const target =
        getFirstFocusable(panel) ?? panel.querySelector<HTMLElement>(
          "button[aria-label='Close']",
        );
      target?.focus();
    }, 0);

    return () => {
      clearTimeout(t);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [open]);

  // Esc to close + focus trap on Tab.
  useEffect(() => {
    if (!open) return;
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
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1050] flex items-start justify-center bg-bg-0/80 px-4 pt-24 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId.current}
    >
      <div
        ref={panelRef}
        className={cn(
          "w-full max-w-md rounded-md border border-border bg-bg-1 shadow-lg",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2
            id={titleId.current}
            className="text-sm font-semibold text-text-0"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-text-2 hover:bg-bg-3 hover:text-text-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * Selector for elements that participate in the focus trap.
 * Excludes `tabindex="-1"` (programmatic focus only).
 */
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

function getFirstFocusable(root: HTMLElement): HTMLElement | null {
  // Prefer an explicit `data-autofocus` if the caller marks one. Otherwise
  // pick the first interactive element that isn't the close button — the
  // close button as the initial target is rarely what the user wants.
  const explicit = root.querySelector<HTMLElement>("[data-autofocus]");
  if (explicit) return explicit;
  const focusables = getFocusables(root);
  const nonClose = focusables.find(
    (el) => el.getAttribute("aria-label") !== "Close",
  );
  return nonClose ?? focusables[0] ?? null;
}
