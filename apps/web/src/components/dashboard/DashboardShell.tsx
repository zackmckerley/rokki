"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { MobileTabBar } from "./MobileTabBar";
import { ResizeHandle, useResizable } from "@/components/ResizeHandle";

const LEFT_COLLAPSE_KEY = "rokki:dash-left-collapsed";

/**
 * Three-rail dashboard shell, responsive.
 *
 *  Desktop (≥1024px):
 *    ┌───────────────────────────┐
 *    │  topBar                   │
 *    ├───────────────────────────┤
 *    │  ticker                   │
 *    ├─────┬──────────────┬──────┤
 *    │  L  │   center     │  R   │
 *    └─────┴──────────────┴──────┘
 *
 *  Mobile (<1024px):
 *    ┌───────────────────────────┐
 *    │  topBar                   │
 *    ├───────────────────────────┤
 *    │  ticker                   │
 *    ├───────────────────────────┤
 *    │                           │
 *    │  center (scrolls)         │
 *    │  (messages stacked below) │
 *    │                           │
 *    ├───────────────────────────┤
 *    │  tab bar: Home/Tasks/…    │
 *    └───────────────────────────┘
 *
 * The left rail is fully hidden on mobile — its contents (spaces → terminals
 * tree, tools, account) are reachable through the tab bar and command
 * palette. The right rail (messages) is appended under the center on
 * mobile so nothing is lost.
 *
 * Both rails are user-resizable on desktop via the thin `ResizeHandle`
 * thumbs that flank the center column. Sizes persist in localStorage
 * so a user's preferred ratio sticks across reloads.
 */
export function DashboardShell({
  topBar,
  ticker,
  left,
  center,
  right,
}: {
  topBar: ReactNode;
  ticker: ReactNode;
  left: ReactNode;
  center: ReactNode;
  /**
   * Optional right rail (Messages). Omit it when the center already
   * owns the full width — e.g. the rearrangeable dashboard, where
   * Messages is a movable panel inside the center area rather than a
   * fixed rail.
   */
  right?: ReactNode;
}) {
  const leftRail = useResizable({
    storageKey: "rokki:dash-left-width",
    defaultSize: 260,
    min: 200,
    max: 480,
  });
  const rightRail = useResizable({
    storageKey: "rokki:dash-right-width",
    defaultSize: 320,
    min: 240,
    max: 560,
  });

  // Explorer collapse — a narrow window (or a user who just wants more room)
  // can fold the left rail to a slim strip. Persisted across reloads.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(LEFT_COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(LEFT_COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-bg-0">
      {/* Skip link is now in the root layout (app/layout.tsx) so every page
          gets it. The shell still owns #main-content as the jump target. */}
      {topBar}
      {ticker}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden md:flex-row">
        {collapsed ? (
          // Collapsed: a slim rail whose only control reopens the explorer.
          <aside
            aria-label="Explorer (collapsed)"
            className="hidden w-9 flex-shrink-0 flex-col items-center border-r border-border pt-2 md:flex"
          >
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Open explorer"
              title="Open explorer"
              className="rounded-sm p-1.5 text-text-3 hover:bg-bg-2 hover:text-text-0"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </aside>
        ) : (
          <>
            <aside
              aria-label="Explorer"
              style={{ width: leftRail.size }}
              className="relative hidden flex-shrink-0 border-r border-border md:flex md:flex-col"
            >
              {left}
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Collapse explorer"
                title="Collapse explorer"
                className="absolute right-1 top-1 z-10 rounded-sm p-1 text-text-3 opacity-60 hover:bg-bg-2 hover:text-text-0 hover:opacity-100"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </aside>
            <div className="hidden flex-shrink-0 self-stretch md:flex">
              <ResizeHandle
                ariaLabel="Resize explorer"
                onMouseDown={(e) => leftRail.startDrag(e, { side: "before" })}
              />
            </div>
          </>
        )}
        <main
          id="main-content"
          tabIndex={-1}
          aria-label="Dashboard"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto focus:outline-none"
        >
          {center}
          {right ? (
            <div className="md:hidden" aria-label="Messages">
              {right}
            </div>
          ) : null}
        </main>
        {right ? (
          <>
            <div className="hidden flex-shrink-0 self-stretch md:flex">
              <ResizeHandle
                ariaLabel="Resize messages"
                onMouseDown={(e) => rightRail.startDrag(e, { side: "after" })}
              />
            </div>
            <aside
              aria-label="Messages"
              style={{ width: rightRail.size }}
              className="hidden flex-shrink-0 border-l border-border md:flex md:flex-col"
            >
              {right}
            </aside>
          </>
        ) : null}
      </div>
      <MobileTabBar />
    </div>
  );
}
