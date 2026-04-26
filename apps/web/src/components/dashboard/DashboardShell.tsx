"use client";

import type { ReactNode } from "react";
import { MobileTabBar } from "./MobileTabBar";

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
  right: ReactNode;
}) {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-bg-0">
      {/* Skip link is now in the root layout (app/layout.tsx) so every page
          gets it. The shell still owns #main-content as the jump target. */}
      {topBar}
      {ticker}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden lg:flex-row">
        <aside
          aria-label="Explorer"
          className="hidden flex-shrink-0 border-r border-border lg:flex lg:w-[260px] lg:flex-col"
        >
          {left}
        </aside>
        <main
          id="main-content"
          tabIndex={-1}
          aria-label="Dashboard"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto focus:outline-none"
        >
          {center}
          <div className="lg:hidden" aria-label="Messages">
            {right}
          </div>
        </main>
        <aside
          aria-label="Messages"
          className="hidden flex-shrink-0 border-l border-border lg:flex lg:w-[320px] lg:flex-col"
        >
          {right}
        </aside>
      </div>
      <MobileTabBar />
    </div>
  );
}
