"use client";

import Link from "next/link";
import { Maximize2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded border border-border bg-bg-1",
        className,
      )}
    >
      <header className="flex h-9 flex-shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-2">
            {title}
          </h2>
          {typeof count === "number" ? (
            <span className="font-mono text-[10px] text-text-3">{count}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {headerRight}
          {expandHref ? (
            <Link
              href={expandHref}
              aria-label={`Open ${title}`}
              className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
            >
              <Maximize2 className="h-3.5 w-3.5" />
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
}: {
  title: string;
  count?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col", className)}>
      <header className="flex items-center gap-2 border-b border-border/60 bg-bg-1 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
          {title}
        </span>
        {typeof count === "number" ? (
          <span className="font-mono text-[10px] text-text-3">{count}</span>
        ) : null}
      </header>
      {children}
    </section>
  );
}
