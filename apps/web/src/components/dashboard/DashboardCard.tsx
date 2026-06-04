"use client";

import Link from "next/link";
import { Maximize2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  usePanelHandle,
  usePanelMaximize,
  usePanelMinimize,
} from "./panel-handle";

/**
 * Shared card primitive used across the dashboard. Always has:
 *   - a compact header with a title and an expand-to-route button
 *   - a scrollable content area
 *
 * Cards don't manage their own data. The parent hands them a title, an
 * optional count badge, and a `href` for the full-screen view. This keeps
 * the primitive dumb so the same shell can render every box.
 */
export interface DashboardCardProps {
  /** The title rendered at the top-left of the card header. */
  title: string;
  /** Optional inline count badge rendered after the title, e.g. "5". */
  count?: number;
  /** Route for the maximize button to open. `null` hides the button. */
  expandHref?: string | null;
  /** Optional trailing element in the header (e.g. a filter pill). */
  headerRight?: ReactNode;
  /** Optional extra classes on the outer wrapper. */
  className?: string;
  /** Constrain the scrollable body's max height. Defaults to flex-1. */
  bodyClassName?: string;
  children: ReactNode;
}

export function DashboardCard({
  title,
  count,
  expandHref,
  headerRight,
  className,
  bodyClassName,
  children,
}: DashboardCardProps) {
  // When hosted inside a rearrangeable DashboardPanels, these are the
  // panel's drag grip and maximize/restore toggle; everywhere else they
  // are null (no grip; the expand button stays a plain link).
  const handle = usePanelHandle();
  const maximize = usePanelMaximize();
  const minimize = usePanelMinimize();
  return (
    <section
      // Stronger border + subtle ring/shadow so cards separate from the
      // page background without shouting. `border-border-strong` is one
      // tier darker than `border-border`; the `shadow-sm` adds a hair of
      // depth that's just enough to read as a contained surface in both
      // dark and light mode. Zack's feedback: the previous border was
      // too thin to differentiate sections.
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded border border-border-strong bg-bg-1 shadow-sm",
        className,
      )}
    >
      <header className="flex h-10 flex-shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          {handle}
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-2">
            {title}
          </h2>
          {typeof count === "number" ? (
            <span className="font-mono text-2xs text-text-3">{count}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {headerRight}
          {minimize}
          {/* Hosted in DashboardPanels → maximize/restore toggle.
              Otherwise the original full-page expand link. */}
          {maximize ? (
            maximize
          ) : expandHref ? (
            <Link
              href={expandHref}
              aria-label={`Open ${title}`}
              className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
            >
              <Maximize2 className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

/**
 * A labeled sub-section inside a card. Used e.g. for Assigned / Delegated
 * inside the Tasks card, or per-day groups inside the Week calendar.
 */
export function CardSection({
  title,
  count,
  children,
  className,
  action,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  className?: string;
  /** Optional trailing element in the section header (e.g. "see all →"). */
  action?: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col", className)}>
      <header className="flex items-center gap-2 border-b border-border/60 bg-bg-1 px-3 py-1.5">
        <span className="text-2xs font-semibold uppercase tracking-wide text-text-3">
          {title}
        </span>
        {typeof count === "number" ? (
          <span className="font-mono text-2xs text-text-3">{count}</span>
        ) : null}
        {action ? <span className="ml-auto">{action}</span> : null}
      </header>
      {children}
    </section>
  );
}
