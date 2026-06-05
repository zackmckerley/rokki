"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Check,
  MessageSquare,
  Maximize2,
  Repeat,
  Send,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PriorityDots, StatusPill, DueChip } from "./primitives";
import { priorityEdge } from "./TaskSectionHeader";
import type { TaskRecurrenceRule } from "@rokki/db";

/**
 * The one task row, shared by the in-terminal `TasksPane` and the
 * dashboard `TasksCard` so the two surfaces render identical rows —
 * same square checkbox, same amber "highest-priority" star, same
 * priority left-edge + priority dots + status pill.
 *
 * Terminal-only affordances (drag handle, subtask expander, comments,
 * request-update, inline rename, row selection) are driven by OPTIONAL
 * handlers: omit a handler and its control simply isn't rendered. That
 * lets the dashboard reuse the exact same component while opting out of
 * interactions it can't wire (it has no selection model, no comment
 * panel, etc.) without forking the markup.
 *
 * `terminalName` is a dashboard-only chip — the dashboard list spans
 * terminals, so each row labels which terminal it belongs to. The
 * in-terminal pane omits it (you're already inside the terminal).
 */
export interface TaskRowTask {
  id: string;
  title: string;
  status: string;
  /** 1=High, 2=Medium, 3=Low, null=No priority. */
  priority: number | null;
  due_date: string | null;
  ticker_seq: number;
  starred?: boolean | null;
  subtask_total?: number | null;
  subtask_done?: number | null;
  latest_status_text?: string | null;
  external_assignee_emails?: string[] | null;
  recurrence_rule?: TaskRecurrenceRule | null;
}

export function TaskRow({
  task,
  ticker,
  selected = false,
  expanded = false,
  draggable = false,
  terminalName,
  onClick,
  onToggle,
  onToggleStar,
  onOpenComments,
  onToggleExpand,
  onRequestUpdate,
  onRename,
}: {
  task: TaskRowTask;
  ticker: string;
  selected?: boolean;
  expanded?: boolean;
  draggable?: boolean;
  /** Dashboard-only: label the terminal this row belongs to. */
  terminalName?: string;
  onClick?: () => void;
  /** Required — the checkbox toggles done. */
  onToggle: () => void;
  /**
   * Flip the "highest priority of the day" star. Starred rows float
   * to the top of the list regardless of priority/due/position. Omit
   * to hide the star control.
   */
  onToggleStar?: () => void;
  /** Omit to hide the comments button. */
  onOpenComments?: () => void;
  /** Omit to hide the subtask expander chevron. */
  onToggleExpand?: () => void;
  /** Omit to hide the request-status-update button. */
  onRequestUpdate?: () => void;
  /**
   * Persist a renamed title. When provided, the title is inline-editable
   * (single click opens the task, double-click renames). When omitted,
   * the title is a plain link to the task detail page.
   */
  onRename?: (nextTitle: string) => void;
}) {
  const done = task.status === "done";
  const subtaskTotal = task.subtask_total ?? 0;
  const subtaskDone = task.subtask_done ?? 0;
  const status = task.latest_status_text?.trim() ?? "";
  const externalCount = task.external_assignee_emails?.length ?? 0;
  const externalEmailsTitle =
    externalCount > 0
      ? `External assignees: ${task.external_assignee_emails!.join(", ")}`
      : "";
  const href = `/p/${ticker}/task/${task.ticker_seq}`;

  return (
    <div
      onClick={onClick}
      className={cn(
        // Always reserve a 2px left edge (pl-[10px] + 2px border = the
        // base px-3) so colouring it never shifts the row. The edge
        // signals priority at a glance — High red, Medium amber — and
        // is overridden by the amber selection edge when the row is
        // active. py-1.5 matches the Week/Messages rows for one density.
        "group flex items-center gap-2 border-l-2 py-[var(--rk-row-py)] pr-3 pl-[10px] transition-colors",
        onClick ? "cursor-pointer" : "",
        selected ? "bg-bg-2" : "hover:bg-bg-2",
        selected ? "border-l-border-focus" : priorityEdge(task.priority),
      )}
    >
      {/* Drag handle. Only rendered when the parent is in Manual sort
          mode (the actual draggable attribute is on the <li>); the
          handle is a hint that the row CAN be dragged. */}
      {draggable ? (
        <span
          aria-hidden="true"
          title="Drag to reorder"
          className="flex h-4 w-3 flex-shrink-0 cursor-grab items-center justify-center text-text-3 group-hover:text-text-1 active:cursor-grabbing"
        >
          <span className="grid h-3 w-1.5 grid-cols-2 grid-rows-3 gap-[1px]">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className="block h-[2px] w-[2px] rounded-full bg-current"
              />
            ))}
          </span>
        </span>
      ) : null}
      {onToggleExpand ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          aria-label={expanded ? "Collapse subtasks" : "Expand subtasks"}
          aria-expanded={expanded}
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm text-text-3 hover:bg-bg-3 hover:text-text-0"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          )}
        </button>
      ) : null}
      {onToggleStar ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          aria-label={
            task.starred ? "Unstar (remove from top)" : "Star (pin to top)"
          }
          aria-pressed={task.starred ?? false}
          title={
            task.starred
              ? "Starred — highest priority. Click to unstar."
              : "Star to pin to top of the list"
          }
          className={cn(
            "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm transition-colors",
            task.starred
              ? "text-warning"
              : "text-text-3 hover:text-warning opacity-0 group-hover:opacity-100",
            // Starred state stays visible always — even when not hovered —
            // because the star is the highest-priority signal on the row.
          )}
        >
          <Star
            className="h-3 w-3"
            fill={task.starred ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </button>
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        className={cn(
          "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border",
          done
            ? "border-success bg-success-subtle text-success"
            : "border-border hover:border-accent",
        )}
      >
        {done ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {onRename ? (
          <InlineTitleEditor
            title={task.title}
            done={done}
            href={href}
            onCommit={onRename}
          />
        ) : (
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "truncate text-sm hover:underline",
              done ? "text-text-3 line-through" : "text-text-0",
            )}
          >
            {task.title}
          </Link>
        )}
        {status ? (
          <span
            className="flex items-center gap-1 truncate text-xs leading-tight text-text-2"
            title={status}
          >
            <span className="font-mono text-2xs uppercase tracking-wide text-text-3">
              Status
            </span>
            <span className="truncate">{status}</span>
          </span>
        ) : null}
      </div>
      {/* Dashboard-only terminal label (the list spans terminals). Fixed
          width + right alignment so the terminal-name column lines up
          across rows regardless of label length. */}
      {terminalName ? (
        <span
          className="hidden w-20 flex-shrink-0 truncate text-right text-xs text-text-3 md:inline"
          title={terminalName}
        >
          {terminalName}
        </span>
      ) : null}
      {/* Subtask roll-up — surfaces the count without expanding. The
          list endpoint already returns subtask_total/subtask_done
          aggregates, so this is free. */}
      {subtaskTotal > 0 ? (
        <span
          className="flex-shrink-0 rounded-sm bg-bg-3 px-1 font-mono text-2xs text-text-2"
          title={`${subtaskDone} of ${subtaskTotal} subtasks done`}
        >
          {subtaskDone}/{subtaskTotal}
        </span>
      ) : null}
      {externalCount > 0 ? (
        <span
          className="flex-shrink-0 rounded-sm border border-border bg-bg-2 px-1 font-mono text-2xs uppercase tracking-wide text-text-2"
          title={externalEmailsTitle}
        >
          @+{externalCount}
        </span>
      ) : null}
      <Link
        href={href}
        onClick={(e) => e.stopPropagation()}
        aria-label="Open task detail"
        className="rounded-sm p-1 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-text-0 group-hover:opacity-100"
      >
        <Maximize2 className="h-3 w-3" />
      </Link>
      {onOpenComments ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenComments();
          }}
          aria-label="Comments"
          className="rounded-sm p-1 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-text-0 group-hover:opacity-100"
        >
          <MessageSquare className="h-3 w-3" />
        </button>
      ) : null}
      {onRequestUpdate ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRequestUpdate();
          }}
          aria-label="Request status update"
          title="Request status update"
          className="rounded-sm p-1 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-accent group-hover:opacity-100"
        >
          <Send className="h-3 w-3" />
        </button>
      ) : null}
      {/* Right-side fixed-width column cells so dates / priority / status
          align in vertical columns across rows. Empty cells render a
          placeholder of the same width so absent values don't shift the
          downstream columns. */}
      <span className="flex w-14 flex-shrink-0 items-center justify-end">
        {task.due_date ? <DueChip date={task.due_date} /> : null}
      </span>
      {task.recurrence_rule ? (
        <span
          className="flex flex-shrink-0 items-center gap-0.5 rounded-sm border border-border bg-bg-2 px-1 py-0.5 text-2xs uppercase tracking-wide text-text-2"
          title={`Repeats ${recurrenceLabel(task.recurrence_rule)}`}
        >
          <Repeat className="h-2.5 w-2.5" aria-hidden="true" />
          {recurrenceShortLabel(task.recurrence_rule)}
        </span>
      ) : null}
      <span className="flex w-14 flex-shrink-0 items-center justify-end">
        <PriorityDots priority={task.priority} />
      </span>
      {/* Status pill: hide "todo" — every row in this list is by definition
          a to-do, so the pill is redundant. Other statuses (in_progress,
          blocked, review, done) still render their pill. */}
      {task.status !== "todo" ? <StatusPill status={task.status} /> : null}
    </div>
  );
}

/** Long form for tooltips: "Daily", "Weekly", "Monthly ×2". */
export function recurrenceLabel(rule: TaskRecurrenceRule): string {
  const base =
    rule.pattern === "daily"
      ? "Daily"
      : rule.pattern === "weekly"
        ? "Weekly"
        : "Monthly";
  return rule.interval > 1 ? `${base} ×${rule.interval}` : base;
}

/** Single-char chip glyph: "D", "W", "M" (+ optional interval). */
export function recurrenceShortLabel(rule: TaskRecurrenceRule): string {
  const letter =
    rule.pattern === "daily" ? "D" : rule.pattern === "weekly" ? "W" : "M";
  return rule.interval > 1 ? `${letter}${rule.interval}` : letter;
}

/**
 * Inline title editor for a task row. Renders as a clickable title in
 * its default state — single click navigates to the task detail page,
 * double-click flips to a focused `<input>` for rename. Enter commits,
 * Escape cancels, blur commits the current value.
 *
 * Single vs. double click is disambiguated with a short timer: the
 * navigate fires ~220ms after click unless a dblclick lands first and
 * cancels it. Matches the gesture used by Finder/Notes for "click =
 * open, double-click = rename".
 *
 * Commit semantics:
 *   - Trim → compare to original. If unchanged: silent revert.
 *   - If changed and ≤ 300 chars: call onCommit. Parent owns the
 *     PATCH + optimistic update + rollback on failure.
 *   - If empty after trim: silent revert (no destructive rename).
 *
 * Doesn't bubble Enter / clicks while editing — those would
 * otherwise toggle the parent row's complete state or open
 * comments. `stopPropagation` on the key + click handlers
 * isolates the input.
 */
function InlineTitleEditor({
  title,
  done,
  href,
  onCommit,
}: {
  title: string;
  done: boolean;
  /**
   * Destination for a single-click on the title (the task detail page).
   * The row's own click handler still selects the row; navigation runs
   * on its own short timer so a dblclick can cancel it and enter
   * rename mode instead.
   */
  href: string;
  onCommit: (next: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Holds the pending navigation timer started by a single click. A
  // subsequent dblclick clears it so we don't navigate-and-rename in
  // the same gesture.
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset the draft whenever the upstream title changes — handles the
  // case where another collaborator renames the row while we're not
  // editing (realtime push lands).
  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  // Auto-select on focus so a double-click → type-to-replace flow
  // feels native (matches Finder rename, GitHub issue titles, etc.).
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // Cancel any pending nav timer on unmount so a row that scrolls off
  // mid-gesture doesn't try to navigate later.
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === title) {
      // Empty or unchanged — silent revert.
      setDraft(title);
      return;
    }
    onCommit(next);
  }

  function cancel() {
    setDraft(title);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span
        className={cn(
          "cursor-pointer truncate text-sm hover:underline",
          done ? "text-text-3 line-through" : "text-text-0",
        )}
        role="link"
        title="Click to open · double-click to rename"
        onClick={(e) => {
          // Don't bubble — the row's own onClick should still fire to
          // select the row, but we want full control over the timer.
          // `setSelectedIdx` lives on the outer row click; calling it
          // here too is redundant but harmless. We stopPropagation to
          // avoid double-selection animations.
          e.stopPropagation();
          if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
          clickTimerRef.current = setTimeout(() => {
            clickTimerRef.current = null;
            router.push(href);
          }, 220);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          // Cancel the pending navigate from the preceding single click.
          if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
          }
          setEditing(true);
        }}
      >
        {title}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
      maxLength={300}
      aria-label="Task title"
      className={cn(
        "min-w-0 flex-1 truncate rounded-sm border border-border-focus bg-bg-0 px-1 py-0.5 text-sm text-text-0 outline-none",
        done && "line-through",
      )}
    />
  );
}
