"use client";

import type { ReactNode } from "react";
import { MobileTabBar } from "./MobileTabBar";
import { ResizeHandle, useResizable } from "@/components/ResizeHandle";

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
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-bg-0">
      {/* Skip link is now in the root layout (app/layout.tsx) so every page
          gets it. The shell still owns #main-content as the jump target. */}
      {topBar}
      {ticker}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden lg:flex-row">
        <aside
          aria-label="Explorer"
          style={{ width: leftRail.size }}
          className="hidden flex-shrink-0 border-r border-border lg:flex lg:flex-col"
        >
          {left}
        </aside>
        <div className="hidden flex-shrink-0 self-stretch lg:flex">
          <ResizeHandle
            ariaLabel="Resize explorer"
            onMouseDown={(e) =>
              leftRail.startDrag(e, { side: "before" })
            }
          />
        </div>
        <main
          id="main-content"
          tabIndex={-1}
          aria-label="Dashboard"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto focus:outline-none"
        >
          {center}
          {right ? (
            <div className="lg:hidden" aria-label="Messages">
              {right}
            </div>
          ) : null}
        </main>
        {right ? (
          <>
            <div className="hidden flex-shrink-0 self-stretch lg:flex">
              <ResizeHandle
                ariaLabel="Resize messages"
                onMouseDown={(e) => rightRail.startDrag(e, { side: "after" })}
              />
            </div>
            <aside
              aria-label="Messages"
              style={{ width: rightRail.size }}
              className="hidden flex-shrink-0 border-l border-border lg:flex lg:flex-col"
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
