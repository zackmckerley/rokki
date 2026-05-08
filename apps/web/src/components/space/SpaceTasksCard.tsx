"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, AlertOctagon, Clock, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardCard, CardSection } from "@/components/dashboard/DashboardCard";
import {
  PriorityDots,
  TickerChip,
  DueChip,
} from "@/components/primitives";
import type { SpaceTaskRow } from "@/lib/space-queries";

interface SpaceTasksCardProps {
  assignedToMe: SpaceTaskRow[];
  overdue: SpaceTaskRow[];
  blocked: SpaceTaskRow[];
  dueThisWeek: SpaceTaskRow[];
}

type Tab = "mine" | "overdue" | "blocked" | "week";

/**
 * Item #2 — aggregate task roll-up across the whole space. Four
 * tabs, never visible all at once: "Mine" (assigned to me),
 * "Overdue", "Blocked", "Due this week". Empty tabs render a
 * neutral message instead of a noisy zero state.
 *
 * Each row deep-links to its task detail. Counts on the tab
 * labels make spotting hot spots easy without clicking through.
 */
export function SpaceTasksCard({
  assignedToMe,
  overdue,
  blocked,
  dueThisWeek,
}: SpaceTasksCardProps) {
  const [tab, setTab] = useState<Tab>(
    overdue.length > 0
      ? "overdue"
      : assignedToMe.length > 0
        ? "mine"
        : blocked.length > 0
          ? "blocked"
          : "week",
  );

  const visible: SpaceTaskRow[] = (() => {
    switch (tab) {
      case "mine":
        return assignedToMe;
      case "overdue":
        return overdue;
      case "blocked":
        return blocked;
      case "week":
        return dueThisWeek;
    }
  })();

  return (
    <DashboardCard
      title="Tasks"
      count={
        assignedToMe.length +
        overdue.length +
        blocked.length +
        dueThisWeek.length
      }
      expandHref={null}
    >
      <CardSection
        title=""
        action={
          <div role="tablist" aria-label="Task filter">
            <TabButton
              active={tab === "mine"}
              count={assignedToMe.length}
              onClick={() => setTab("mine")}
              icon={<UserIcon className="h-3 w-3" aria-hidden="true" />}
              label="Mine"
            />
            <TabButton
              active={tab === "overdue"}
              count={overdue.length}
              tone={overdue.length > 0 ? "danger" : "neutral"}
              onClick={() => setTab("overdue")}
              icon={<AlertOctagon className="h-3 w-3" aria-hidden="true" />}
              label="Overdue"
            />
            <TabButton
              active={tab === "blocked"}
              count={blocked.length}
              tone={blocked.length > 0 ? "warning" : "neutral"}
              onClick={() => setTab("blocked")}
              icon={<AlertOctagon className="h-3 w-3" aria-hidden="true" />}
              label="Blocked"
            />
            <TabButton
              active={tab === "week"}
              count={dueThisWeek.length}
              onClick={() => setTab("week")}
              icon={<Clock className="h-3 w-3" aria-hidden="true" />}
              label="Week"
            />
          </div>
        }
      >
        {visible.length === 0 ? (
          <p className="px-3 py-4 text-center text-[11px] text-text-3">
            {emptyForTab(tab)}
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {visible.slice(0, 12).map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        )}
      </CardSection>
    </DashboardCard>
  );
}

function TabButton({
  active,
  count,
  onClick,
  icon,
  label,
  tone = "neutral",
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone?: "neutral" | "danger" | "warning";
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "ml-1 inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
        active
          ? "border-accent/40 bg-bg-3 text-text-0"
          : "border-border bg-bg-2 text-text-2 hover:bg-bg-3",
      )}
    >
      {icon}
      <span>{label}</span>
      <span
        className={cn(
          "ml-0.5 font-mono text-[10px]",
          active ? "text-text-1" : "text-text-3",
          tone === "danger" && count > 0 && "text-danger",
          tone === "warning" && count > 0 && "text-warning",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function TaskRow({ task }: { task: SpaceTaskRow }) {
  const href = task.ticker
    ? `/p/${task.ticker}/task/${task.ticker_seq}`
    : undefined;
  const [optimisticDone, setOptimisticDone] = useState<boolean | null>(null);
  const isDone =
    optimisticDone !== null ? optimisticDone : task.status === "done";

  /**
   * Toggle done from the space-page row. Same affordance as the
   * dashboard TasksCard — clicking the circle should flip status
   * without leaving the page. Optimistic on click; reconciles
   * silently against the server.
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

  const linkContent = (
    <>
      {task.ticker ? <TickerChip>{task.ticker}</TickerChip> : null}
      <span
        className={cn(
          "flex-1 truncate",
          isDone ? "text-text-3 line-through" : "text-text-0",
        )}
      >
        {task.title}
      </span>
      {task.assignees.length > 0 ? (
        <span
          className="hidden truncate text-text-2 md:inline max-w-[12ch]"
          title={task.assignees.map((a) => a.full_name ?? "—").join(", ")}
        >
          {task.assignees[0].full_name ??
            (task.assignees.length === 1 ? "—" : "")}
          {task.assignees.length > 1
            ? ` +${task.assignees.length - 1}`
            : ""}
        </span>
      ) : null}
      <PriorityDots priority={task.priority} />
      {task.due_date ? <DueChip date={task.due_date} /> : null}
    </>
  );

  // Button + Link as siblings (NOT button-inside-link, which is
  // invalid HTML and silently swallows the button click in some
  // browsers). The whole row gets the hover effect via the <li>
  // so it still reads as one unit.
  const borderForStatus =
    task.status === "blocked"
      ? "border-danger"
      : task.status === "review"
        ? "border-warning"
        : task.status === "in_progress"
          ? "border-info"
          : "border-text-3";
  return (
    <li
      data-row
      className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-bg-2"
    >
      <button
        type="button"
        onClick={toggleDone}
        aria-label={isDone ? "Mark as not done" : "Mark as done"}
        className={cn(
          "flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full border transition-colors",
          isDone
            ? "border-success bg-success-subtle text-success"
            : `${borderForStatus} hover:border-accent`,
        )}
      >
        {isDone ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : null}
      </button>
      {href ? (
        <Link
          href={href}
          className="flex flex-1 items-center gap-2 min-w-0"
        >
          {linkContent}
        </Link>
      ) : (
        <div className="flex flex-1 items-center gap-2 min-w-0">
          {linkContent}
        </div>
      )}
    </li>
  );
}

function emptyForTab(tab: Tab): string {
  switch (tab) {
    case "mine":
      return "Nothing assigned to you in this space.";
    case "overdue":
      return "Nothing overdue. Nice.";
    case "blocked":
      return "No blocked tasks.";
    case "week":
      return "Nothing due this week.";
  }
}
