"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sticky, collapsible group header shared by the in-terminal TasksPane
 * and the dashboard TasksCard so the two surfaces look identical
 * (improvement #14). One source of truth for the header chrome:
 *
 *   ▎● LABEL                              ⟨count⟩
 *   │ │ └ uppercase mono label            └ pill
 *   │ └ semantic dot
 *   └ semantic left tick
 *
 * `tone` is a Tailwind bg-* class (use `groupTone()` below) painting
 * the tick + dot with the bucket's meaning. Sticks to the top of the
 * scroll container so the current section is always identifiable.
 */
export function TaskSectionHeader({
  label,
  count,
  tone,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  /** Tailwind bg-* class for the tick + dot (see `groupTone`). */
  tone: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <header
      role="button"
      tabIndex={0}
      aria-expanded={!collapsed}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className="sticky top-0 z-[2] flex h-7 cursor-pointer select-none items-center gap-2 border-b border-border bg-bg-2 pr-3 transition-colors hover:bg-bg-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-border-focus"
    >
      {/* Colored left tick carrying the bucket's meaning. */}
      <span aria-hidden="true" className={cn("h-full w-[3px] flex-shrink-0", tone)} />
      {collapsed ? (
        <ChevronRight className="h-3 w-3 flex-shrink-0 text-text-3" aria-hidden="true" />
      ) : (
        <ChevronDown className="h-3 w-3 flex-shrink-0 text-text-3" aria-hidden="true" />
      )}
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", tone)}
      />
      <span className="font-mono text-2xs font-semibold uppercase tracking-wide text-text-1">
        {label}
      </span>
      <span className="ml-auto rounded-full bg-bg-3 px-1.5 py-0.5 font-mono text-2xs leading-none text-text-2">
        {count}
      </span>
    </header>
  );
}

/**
 * Semantic accent (Tailwind bg-* class) for a group header's tick + dot,
 * derived from the group-by mode and the bucket key. Carries the
 * bucket's meaning at a glance. Covers every mode used by either
 * surface: due / priority / status (semantic) and terminal / assignee /
 * none (neutral). Keys match the buckets in lib/task-grouping.ts.
 */
export function groupTone(mode: string, key: string): string {
  if (mode === "due") {
    if (key === "overdue") return "bg-danger";
    if (key === "today") return "bg-accent";
    if (key === "week") return "bg-warning";
    return "bg-text-3"; // later / none
  }
  if (mode === "priority") {
    if (key === "high") return "bg-danger";
    if (key === "med") return "bg-warning";
    return "bg-text-3"; // low / none
  }
  if (mode === "status") {
    if (key === "blocked") return "bg-danger";
    if (key === "review") return "bg-warning";
    if (key === "in_progress") return "bg-info";
    if (key === "done") return "bg-success";
    return "bg-text-3"; // todo
  }
  // terminal / assignee — not a severity axis, stay neutral.
  return "bg-text-3";
}

/**
 * Tailwind left-border class for a task row, painting a 2px edge by
 * priority (1=High red, 2=Medium amber, else transparent). Shared so
 * rows in both the terminal pane and the dashboard read the same.
 * Always render the row with `border-l-2` so colouring never shifts
 * layout; pass the result alongside.
 */
export function priorityEdge(priority: number | null | undefined): string {
  if (priority === 1) return "border-l-danger";
  if (priority === 2) return "border-l-warning";
  return "border-l-transparent";
}
