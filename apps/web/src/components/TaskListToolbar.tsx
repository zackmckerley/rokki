"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Plus, Maximize2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  usePanelHandle,
  usePanelMaximize,
  usePanelMinimize,
} from "./dashboard/panel-handle";

export interface GroupOption {
  value: string;
  label: string;
}

/**
 * The one task-list toolbar, shared by the in-terminal TasksPane and the
 * dashboard TasksCard so the two surfaces present an identical interface:
 *
 *   Tasks  N   [Auto | Manual]   Group [▾]   [Hide done N]   Filter…   + New task
 *
 * Every control is driven by props so each surface wires its own state.
 * `allowManual=false` greys the Manual sort (the dashboard has no
 * per-task manual order — drag-to-reorder lives inside a terminal).
 */
export function TaskListToolbar({
  title = "Tasks",
  count,
  sortMode,
  onSortMode,
  allowManual = true,
  groupMode,
  onGroupMode,
  groupOptions,
  hideDone,
  onHideDone,
  doneCount,
  starredOnly = false,
  onStarredOnly,
  query,
  onQuery,
  newTaskHref,
  onNewTask,
  newTaskDisabled = false,
  newTaskShortcut = "C",
  expandHref,
}: {
  title?: string;
  count: number;
  sortMode: "auto" | "manual";
  onSortMode: (m: "auto" | "manual") => void;
  allowManual?: boolean;
  groupMode: string;
  onGroupMode: (m: string) => void;
  groupOptions: GroupOption[];
  hideDone: boolean;
  onHideDone: () => void;
  doneCount: number;
  /** Starred-only filter. Omit `onStarredOnly` to hide the control. */
  starredOnly?: boolean;
  onStarredOnly?: () => void;
  query: string;
  onQuery: (q: string) => void;
  /** New-task destination. Provide a href OR an onClick, not both. */
  newTaskHref?: string;
  onNewTask?: () => void;
  newTaskDisabled?: boolean;
  newTaskShortcut?: string;
  /** Optional maximize/expand link (dashboard → full-page view). */
  expandHref?: string;
}) {
  // Drag grip + maximize toggle when hosted in a rearrangeable
  // DashboardPanels; null inside a terminal, where the toolbar isn't a
  // movable panel (the expand button stays its normal link there).
  const handle = usePanelHandle();
  const maximize = usePanelMaximize();
  const minimize = usePanelMinimize();
  return (
    <>
      {/* Row 1 — the title bar. Identical to DashboardCard's header
          (h-9, same padding, divider, and title treatment) so the Tasks
          box lines up header-for-header with Schedule and Messages. The
          list controls live in the compact strip below (row 2). */}
      <div className="flex h-[var(--rk-card-header-h)] flex-shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          {handle}
          <h2
            title={title}
            className="truncate text-xs font-semibold uppercase tracking-wide text-text-2"
          >
            {title}
          </h2>
          <span className="flex-shrink-0 font-mono text-2xs text-text-3">
            {count}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {minimize}
          {/* Hosted in DashboardPanels → maximize/restore toggle.
              Otherwise the original full-page expand link. */}
          {maximize ? (
            maximize
          ) : expandHref ? (
            <Link
              href={expandHref}
              aria-label="Open full task list"
              className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
            >
              <Maximize2 className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </div>

      {/* Row 2 — the controls strip: sort / group / hide-done on the
          left, filter + new task on the right. Compact density. */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-[var(--rk-ctrl-py)]">
        <div className="flex flex-wrap items-center gap-2">
          {/* Sort toggle. Auto = triage order (incomplete, priority, due,
              created). Manual = drag-to-reorder (terminal only). */}
          <span
            role="tablist"
            aria-label="Task sort order"
            className="flex items-center gap-0 overflow-hidden rounded-sm border border-border text-2xs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={sortMode === "auto"}
              onClick={() => onSortMode("auto")}
              className={cn(
                "px-2 py-0.5 font-mono uppercase tracking-wide",
                sortMode === "auto"
                  ? "bg-bg-3 text-text-0"
                  : "text-text-3 hover:bg-bg-2 hover:text-text-1",
              )}
            >
              Auto
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sortMode === "manual"}
              disabled={!allowManual}
              title={
                allowManual
                  ? undefined
                  : "Manual drag-to-reorder is available inside a terminal"
              }
              onClick={() => allowManual && onSortMode("manual")}
              className={cn(
                "px-2 py-0.5 font-mono uppercase tracking-wide",
                sortMode === "manual" && allowManual
                  ? "bg-bg-3 text-text-0"
                  : "text-text-3 hover:bg-bg-2 hover:text-text-1",
                !allowManual && "cursor-not-allowed opacity-40 hover:bg-transparent",
              )}
            >
              Manual
            </button>
          </span>

          {/* Group-by selector — sections the list with sticky headers. */}
          <label className="flex items-center gap-1 text-2xs">
            <span className="font-mono uppercase tracking-wide text-text-3">
              Group
            </span>
            <select
              value={groupMode}
              onChange={(e) => onGroupMode(e.target.value)}
              className="rounded-sm border border-border bg-bg-1 px-1 py-0.5 font-mono text-2xs uppercase tracking-wide text-text-1 outline-none hover:border-border-focus focus:border-border-focus"
              aria-label="Group tasks by"
            >
              {groupOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          {/* Hide-done toggle. Appears only when there are done tasks to
              hide (or the filter is already on), with a count so the
              hidden work isn't forgotten. */}
          {doneCount > 0 || hideDone ? (
            <button
              type="button"
              onClick={onHideDone}
              aria-pressed={hideDone}
              title={
                hideDone
                  ? `Show ${doneCount} completed task${doneCount === 1 ? "" : "s"}`
                  : `Hide ${doneCount} completed task${doneCount === 1 ? "" : "s"} from the list`
              }
              className={cn(
                "flex items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors",
                hideDone
                  ? "border-border bg-bg-2 text-text-2 hover:bg-bg-3"
                  : "border-border bg-bg-1 text-text-3 hover:bg-bg-2 hover:text-text-1",
              )}
            >
              {hideDone ? "Show done" : "Hide done"}
              {doneCount > 0 ? <span className="text-text-3">{doneCount}</span> : null}
            </button>
          ) : null}

          {/* Starred-only filter. A pressed amber star shows just the tasks
              you've starred (pinned to the top of the list). */}
          {onStarredOnly ? (
            <button
              type="button"
              onClick={onStarredOnly}
              aria-pressed={starredOnly}
              title={
                starredOnly
                  ? "Showing only starred tasks — click to show all"
                  : "Show only starred tasks"
              }
              className={cn(
                "flex items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors",
                starredOnly
                  ? "border-warning/50 bg-warning-subtle text-warning"
                  : "border-border bg-bg-1 text-text-3 hover:bg-bg-2 hover:text-text-1",
              )}
            >
              <Star
                className="h-3 w-3"
                fill={starredOnly ? "currentColor" : "none"}
                aria-hidden="true"
              />
              Starred
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <TaskFilterInput value={query} onChange={onQuery} />
          {newTaskHref ? (
            newTaskDisabled ? (
              <span
                title="No terminals yet — create a terminal first"
                aria-disabled="true"
                className="flex cursor-not-allowed items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-3 opacity-60"
              >
                <Plus className="h-3 w-3" /> New task
              </span>
            ) : (
              <Link
                href={newTaskHref}
                className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-2 hover:bg-bg-2 hover:text-text-0"
              >
                <Plus className="h-3 w-3" /> New task
                <kbd className="ml-1 font-mono text-2xs text-text-3">
                  {newTaskShortcut}
                </kbd>
              </Link>
            )
          ) : (
            <button
              type="button"
              onClick={onNewTask}
              disabled={newTaskDisabled}
              className={cn(
                "flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-2 hover:bg-bg-2 hover:text-text-0",
                newTaskDisabled && "cursor-not-allowed opacity-60",
              )}
            >
              <Plus className="h-3 w-3" /> New task
              <kbd className="ml-1 font-mono text-2xs text-text-3">
                {newTaskShortcut}
              </kbd>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Filter input shared by both surfaces. `f` (outside any field) focuses
 * it; Escape clears + blurs.
 */
function TaskFilterInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "f") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t?.tagName === "INPUT" ||
        t?.tagName === "TEXTAREA" ||
        t?.tagName === "SELECT" ||
        t?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative flex items-center">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onChange("");
            ref.current?.blur();
          }
        }}
        placeholder="Filter tasks…"
        aria-label="Filter tasks"
        style={{
          width: "var(--rk-filter-w)",
          height: "var(--rk-filter-h)",
          fontSize: "var(--rk-filter-fs)",
        }}
        className="rounded-sm border border-border bg-bg-1 px-2 pr-6 text-text-0 placeholder:text-text-3 outline-none focus:border-border-focus"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          aria-label="Clear filter"
          className="absolute right-1 rounded-sm p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-0"
        >
          ×
        </button>
      ) : (
        <kbd className="absolute right-1 font-mono text-2xs text-text-3">
          f
        </kbd>
      )}
    </div>
  );
}
