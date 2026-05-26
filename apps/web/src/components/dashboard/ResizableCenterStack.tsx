"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ResizeHandle, useResizable } from "@/components/ResizeHandle";

interface ResizableCenterStackProps {
  /** Optional focus banner (only when a terminal scope is active). */
  focus?: ReactNode;
  /** Dismissible greeting / briefing card. */
  briefing: ReactNode;
  /** Week calendar card — the top resizable pane. */
  week: ReactNode;
  /** Tasks card — the bottom pane, fills the remaining height. */
  tasks: ReactNode;
}

/**
 * Dashboard center column with a draggable splitter between the Week
 * card and the Tasks card.
 *
 *  ┌───────────────────────────────┐
 *  │ (focus banner)                │   ← natural height
 *  │ (briefing)                    │
 *  ├───────────────────────────────┤
 *  │ Week                          │   ← user-resizable
 *  │                               │
 *  ╞═══════════════════════════════╡   ← drag handle (axis="y")
 *  │ Tasks                         │   ← fills remaining
 *  │                               │
 *  └───────────────────────────────┘
 *
 * The handle uses the existing `useResizable` + `ResizeHandle`
 * primitives (same ones that control the left/right rail widths) so
 * the gesture, the cursor, the hit-area, and the localStorage
 * persistence pattern all match what the user already learned from
 * the horizontal rails.
 *
 * Default split: 50% Week / 50% Tasks. Stored as the Week pane's
 * pixel height; Tasks fills the rest via `flex: 1`.
 *
 * Below `lg` the splitter is hidden and cards stack at natural
 * height inside the page's scroll container — the resize gesture
 * doesn't translate to phone/tablet.
 */
export function ResizableCenterStack({
  focus,
  briefing,
  week,
  tasks,
}: ResizableCenterStackProps) {
  // First mount: we don't have the available height yet (SSR has no
  // window) so we render a "fluid" layout matching the old behaviour
  // and only enable the splitter after hydration. Without this the
  // initial paint would either jump (SSR vs client mismatch) or pick
  // a wrong default size and resize on first render.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const weekHeight = useResizable({
    storageKey: "rokki:dash-week-height",
    // Reasonable default — half a typical laptop viewport.
    defaultSize: 360,
    min: 160,
    max: 800,
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-2 sm:p-3">
      {focus}
      {briefing}
      {/* Below lg: stack naturally and let the page scroll. The
          resize splitter only makes sense when there's a fixed
          viewport height to redistribute. */}
      <div className="contents lg:hidden">
        {week}
        {tasks}
      </div>
      <div className="hidden min-h-0 flex-1 flex-col gap-2 lg:flex">
        <div
          className="min-h-0 flex-shrink-0"
          style={hydrated ? { height: weekHeight.size } : undefined}
        >
          {week}
        </div>
        <ResizeHandle
          orientation="horizontal"
          ariaLabel="Resize Week vs Tasks"
          onMouseDown={(e) =>
            weekHeight.startDrag(e, { side: "before", axis: "y" })
          }
        />
        <div className="min-h-0 flex-1">{tasks}</div>
      </div>
    </div>
  );
}
