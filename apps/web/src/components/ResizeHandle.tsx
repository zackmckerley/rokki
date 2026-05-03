"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface UseResizableConfig {
  /** Stable localStorage key — persists size across reloads. */
  storageKey: string;
  /** Initial size in pixels. */
  defaultSize: number;
  /** Minimum width / height. */
  min: number;
  /** Maximum width / height. */
  max: number;
}

/**
 * Hook for the column-width state behind a `<ResizeHandle />`.
 *
 * Tracks one number (the width or height of the adjacent panel),
 * hydrates it from `localStorage` on mount, and exposes a
 * `startDrag` callback that callers wire up to the handle's
 * `onPointerDown`. The handle itself is a presentational thumb;
 * this hook owns the drag math.
 */
export function useResizable({
  storageKey,
  defaultSize,
  min,
  max,
}: UseResizableConfig) {
  const [size, setSize] = useState(defaultSize);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount. Doing it before would race
  // SSR — server has no localStorage and would render `defaultSize`,
  // then a client-side rehydrate would shift the layout. The first
  // render uses defaultSize on both sides; one tick later we apply the
  // saved value.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const n = Number(saved);
        if (Number.isFinite(n)) {
          setSize(Math.min(max, Math.max(min, n)));
        }
      }
    } catch {
      /* localStorage unavailable — stick with defaultSize */
    }
    setHydrated(true);
  }, [storageKey, min, max]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, String(size));
    } catch {
      /* ignore */
    }
  }, [storageKey, size, hydrated]);

  /**
   * Begin a drag. `side` describes which side of the handle the
   * resizable panel sits on:
   *   - "before"  — panel is to the LEFT of the handle. Drag right
   *                  grows it, drag left shrinks it.
   *   - "after"   — panel is to the RIGHT of the handle. Drag left
   *                  grows it, drag right shrinks it.
   *
   * For vertical resizers (top/bottom panels) use `axis="y"`; the
   * deltas are read from clientY instead of clientX.
   *
   * Uses mouse events (not pointer events) on purpose. Some
   * automated browser-control surfaces (Chrome's CDP, the in-app
   * driver) dispatch only `mousedown/mousemove/mouseup` and skip
   * the pointer-event family — every real user gets both, but
   * standardising on mouse means the handle stays drivable from
   * scripts and tests too.
   */
  const startDrag = useCallback(
    (
      e: React.MouseEvent,
      opts: { side: "before" | "after"; axis?: "x" | "y" } = {
        side: "before",
        axis: "x",
      },
    ) => {
      e.preventDefault();
      const axis = opts.axis ?? "x";
      const startCoord = axis === "x" ? e.clientX : e.clientY;
      const startSize = size;

      const onMove = (ev: MouseEvent) => {
        const cur = axis === "x" ? ev.clientX : ev.clientY;
        const delta = cur - startCoord;
        const next =
          opts.side === "before" ? startSize + delta : startSize - delta;
        setSize(Math.min(max, Math.max(min, next)));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      // Dim everything else and lock the cursor while dragging so the
      // user gets unambiguous "I am resizing" feedback even if the
      // mouse leaves the handle.
      document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [size, min, max],
  );

  return { size, setSize, startDrag };
}

interface ResizeHandleProps {
  /**
   * Direction the handle is rendered:
   *   - "vertical"   — a vertical bar between two side-by-side panels
   *                     (drag horizontally to resize)
   *   - "horizontal" — a horizontal bar between stacked panels
   *                     (drag vertically to resize)
   */
  orientation?: "vertical" | "horizontal";
  /** Mouse-down handler. Wire to `useResizable().startDrag`. */
  onMouseDown: (e: React.MouseEvent) => void;
  /** Optional aria-label override. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Draggable thumb that sits between two panels and resizes the one
 * wired to it via `useResizable`.
 *
 * v1 of this component had a 4px-wide visible bar with a 6px hit
 * area, which Zack reported he couldn't grab. v2 keeps the same
 * visual minimalism (a 1px accent line on hover) but expands the
 * hit area to 10px on either side and shows a persistent grip
 * indicator at the column's vertical midpoint, so the affordance
 * is discoverable at a glance.
 *
 * Visuals:
 *   - 1px wide column, hover paints the full column accent
 *   - small "::" grip glyph at the vertical midpoint, faint by
 *     default and brightened on hover, makes the seam discoverable
 *     without dominating the layout
 *   - cursor flips to col-resize / row-resize on hover
 *
 * Accessibility:
 *   - role="separator" with `aria-orientation` so screen readers
 *     announce it as a resizer
 *   - keyboard adjustment is not wired here — pointer drag is v1
 */
export function ResizeHandle({
  orientation = "vertical",
  onMouseDown,
  ariaLabel,
  className,
}: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={ariaLabel ?? "Resize"}
      onMouseDown={onMouseDown}
      className={cn(
        "group relative flex-shrink-0 bg-border transition-colors",
        orientation === "vertical"
          ? "w-px cursor-col-resize hover:bg-accent"
          : "h-px cursor-row-resize hover:bg-accent",
        className,
      )}
    >
      {/* Grip indicator at the midpoint — three subtle dots so the
          user can see this seam is interactive. Sized small so it
          doesn't read as decoration. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute opacity-50 transition-opacity group-hover:opacity-100",
          orientation === "vertical"
            ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[2px]"
            : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-[2px]",
        )}
      >
        <span className="block h-[2px] w-[2px] rounded-full bg-text-3 group-hover:bg-accent" />
        <span className="block h-[2px] w-[2px] rounded-full bg-text-3 group-hover:bg-accent" />
        <span className="block h-[2px] w-[2px] rounded-full bg-text-3 group-hover:bg-accent" />
      </span>
      {/* Generous transparent hit area — easy to grab without
          consuming visible layout space. 10px on either side of
          the 1px line makes the effective click target 21px wide. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute",
          orientation === "vertical"
            ? "inset-y-0 -left-2 -right-2"
            : "inset-x-0 -top-2 -bottom-2",
        )}
      />
    </div>
  );
}
