"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ArrowRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardCard, CardSection } from "./DashboardCard";
import {
  PriorityDots,
  DueChip,
  TickerChip,
} from "@/components/primitives";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import type { AssignedTask, DelegatedTask } from "@/lib/dashboard-queries";

interface TasksCardProps {
  assigned: AssignedTask[];
  delegated: DelegatedTask[];
  /** Map terminal_id → ticker for rendering the ticker chip. */
  tickerById: Record<string, string>;
  /** Optional terminal_id → display name. Rendered after the ticker chip. */
  terminalNameById?: Record<string, string>;
  /**
   * Open the dashboard quick-task dialog. Wired up by DashboardClient
   * so the "+ New task" affordance lives next to its own list — the
   * same button used to live in the page topbar but read as global
   * chrome rather than a Tasks affordance.
   */
  onCreateTask?: () => void;
  /** Disable the create button (e.g. user has zero terminals). */
  createDisabled?: boolean;
}

/**
 * One master card with two stacked sub-sections.
 *
 *   ┌ TASKS ─────────────────┐
 *   │ ASSIGNED TO ME (5)     │
 *   │   task rows …          │
 *   │ DELEGATED (3)          │
 *   │   task rows …          │
 *   └────────────────────────┘
 *
 * Both lists visible at once so the user never has to tab-switch to see a
 * full picture. Overflow scrolls within the card body.
 */
export function TasksCard({
  assigned,
  delegated,
  tickerById,
  terminalNameById,
  onCreateTask,
  createDisabled,
}: TasksCardProps) {
  // Show ~10 rows per the spec; users with more get a "see all" link to a
  // dedicated full-list page.
  const ROW_LIMIT = 10;

  // Subscribe to global task INSERT/UPDATE/DELETE events so the
  // dashboard reflects new work without a refresh — Zack's report:
  // "When i make a new task it doesn't automatically add it to the
  // page. I have to refresh the browser to see it." Filter is
  // intentionally absent (RLS scopes the events to tasks the user
  // can see); we just `router.refresh()` on any of them rather than
  // mutating the props locally, since the card owns view-derived
  // counts and per-row decoration that are easier to recompute
  // server-side.
  const router = useRouter();
  useRealtimeTable<{ id: string }>(
    { table: "tasks", channelKey: "dash:tasks" },
    {
      onInsert: () => router.refresh(),
      onUpdate: () => router.refresh(),
      onDelete: () => router.refresh(),
    },
  );

  return (
    <DashboardCard
      title="Tasks"
      count={assigned.length + delegated.length}
      expandHref="/tasks/mine"
      headerRight={
        onCreateTask ? (
          <button
            type="button"
            onClick={onCreateTask}
            disabled={createDisabled}
            title={
              createDisabled
                ? "No terminals yet — create a terminal first"
                : "New task (⌘N)"
            }
            className={cn(
              "flex items-center gap-1 rounded-sm border border-border bg-bg-2 px-2 py-0.5 text-[10px] uppercase tracking-wide",
              createDisabled
                ? "cursor-not-allowed text-text-3 opacity-60"
                : "text-text-1 hover:border-accent/40 hover:bg-bg-3",
            )}
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            <span>New task</span>
            <kbd className="ml-1 hidden font-mono text-[9px] text-text-3 sm:inline">
              ⌘N
            </kbd>
          </button>
        ) : null
      }
    >
      <CardSection
        title="Assigned to me"
        count={assigned.length}
        action={
          assigned.length > ROW_LIMIT ? (
            <Link
              href="/tasks/mine"
              className="text-[10px] text-text-3 hover:text-text-0"
            >
              see all →
            </Link>
          ) : null
        }
      >
        {assigned.length === 0 ? (
          <EmptyAssigned />
        ) : (
          <ul className="divide-y divide-border/40">
            {assigned.slice(0, ROW_LIMIT).map((t) => (
              <AssignedRow
                key={t.id}
                task={t}
                ticker={tickerById[t.terminal_id]}
                terminalName={terminalNameById?.[t.terminal_id]}
              />
            ))}
          </ul>
        )}
      </CardSection>
      <CardSection
        title="I assigned to others"
        count={delegated.length}
        className="mt-1"
        action={
          delegated.length > ROW_LIMIT ? (
            <Link
              href="/tasks/delegated"
              className="text-[10px] text-text-3 hover:text-text-0"
            >
              see all →
            </Link>
          ) : null
        }
      >
        {delegated.length === 0 ? (
          <EmptyDelegated />
        ) : (
          <ul className="divide-y divide-border/40">
            {delegated.slice(0, ROW_LIMIT).map((t) => (
              <DelegatedRow
                key={t.id}
                task={t}
                ticker={tickerById[t.terminal_id]}
                terminalName={terminalNameById?.[t.terminal_id]}
              />
            ))}
          </ul>
        )}
      </CardSection>
    </DashboardCard>
  );
}

function AssignedRow({
  task,
  ticker,
  terminalName,
}: {
  task: AssignedTask;
  ticker?: string;
  terminalName?: string;
}) {
  const [optimisticDone, setOptimisticDone] = useState<boolean | null>(null);
  const isDone =
    optimisticDone !== null ? optimisticDone : task.status === "done";
  // Deep-link to the task detail surface so a click puts the user one step
  // away from the work, not just on the parent terminal page.
  const href = ticker ? `/p/${ticker}/task/${task.ticker_seq}` : undefined;

  /**
   * Toggle done directly from the dashboard row. The status icon
   * used to be decorative (just a Check / Circle); it's now a
   * button so the user can flip a task without navigating into
   * the detail page. Optimistic — flips locally on click,
   * reconciles silently against the server response.
   */
  async function toggleDone(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !isDone;
    setOptimisticDone(next);
    try {
      const r = await fetch(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next ? "done" : "todo" }),
      });
      if (!r.ok) setOptimisticDone(null);
    } catch {
      setOptimisticDone(null);
    }
  }

  const statusButton = (
    <button
      type="button"
      onClick={toggleDone}
      aria-label={isDone ? "Mark as not done" : "Mark as done"}
      className={cn(
        "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border transition-colors",
        isDone
          ? "border-success bg-success-subtle text-success"
          : "border-text-3 hover:border-accent",
      )}
    >
      {isDone ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : null}
    </button>
  );

  const body = (
    <div
      data-row
      className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-bg-2"
    >
      {statusButton}
      {ticker ? <TickerChip>{ticker}</TickerChip> : null}
      <span
        className={cn(
          "flex-1 truncate",
          isDone ? "text-text-3 line-through" : "text-text-0",
        )}
      >
        {task.title}
      </span>
      {terminalName ? (
        <span
          className="hidden truncate text-text-3 md:inline max-w-[10ch]"
          title={terminalName}
        >
          {terminalName}
        </span>
      ) : null}
      <PriorityDots priority={task.priority} />
      {task.due_date ? <DueChip date={task.due_date} /> : null}
    </div>
  );
  return href ? (
    <li>
      <Link href={href} className="block">
        {body}
      </Link>
    </li>
  ) : (
    <li>{body}</li>
  );
}

function DelegatedRow({
  task,
  ticker,
  terminalName,
}: {
  task: DelegatedTask;
  ticker?: string;
  terminalName?: string;
}) {
  const href = ticker ? `/p/${ticker}/task/${task.ticker_seq}` : undefined;
  const assigneeLabel = task.assignees
    .map((a) => a.full_name ?? "someone")
    .join(", ");
  const body = (
    <div
      data-row
      className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-bg-2"
    >
      <ArrowRight className="h-3 w-3 flex-shrink-0 text-text-3" />
      {ticker ? <TickerChip>{ticker}</TickerChip> : null}
      <span className="flex-1 truncate text-text-0">{task.title}</span>
      <span
        className="hidden truncate text-text-2 md:inline max-w-[14ch]"
        title={assigneeLabel}
      >
        {assigneeLabel}
      </span>
      {terminalName ? (
        <span
          className="hidden truncate text-text-3 lg:inline max-w-[10ch]"
          title={terminalName}
        >
          {terminalName}
        </span>
      ) : null}
      <PriorityDots priority={task.priority} />
      {task.due_date ? <DueChip date={task.due_date} /> : null}
    </div>
  );
  return href ? (
    <li>
      <Link href={href} className="block">
        {body}
      </Link>
    </li>
  ) : (
    <li>{body}</li>
  );
}

function EmptyAssigned() {
  return (
    <p className="px-3 py-3 text-[11px] text-text-3">
      You&apos;re clear. Nothing currently assigned to you.
    </p>
  );
}
function EmptyDelegated() {
  return (
    <p className="px-3 py-3 text-[11px] text-text-3">
      Nothing waiting on others.
    </p>
  );
}

