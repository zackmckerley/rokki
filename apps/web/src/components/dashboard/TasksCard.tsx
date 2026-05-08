"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Check,
  ArrowRight,
  Plus,
  AlertOctagon,
  Clock,
  Layers,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardCard } from "./DashboardCard";
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

  const router = useRouter();
  useRealtimeTable<{ id: string }>(
    { table: "tasks", channelKey: "dash:tasks" },
    {
      onInsert: () => router.refresh(),
      onUpdate: () => router.refresh(),
      onDelete: () => router.refresh(),
    },
  );

  // Filter chips per Zack's "filter between different items
  // directly in tasks on the dashboard." Tabs replace the old
  // two-section split (Assigned to me + I assigned to others)
  // with five filter modes plus a default that preserves the old
  // shape under the "Mine" + "Delegated" tabs.
  type Tab = "mine" | "delegated" | "overdue" | "week" | "all";
  type DashGroupBy = "none" | "terminal" | "priority" | "due" | "assignee";
  const [tab, setTab] = useState<Tab>("mine");
  const [groupBy, setGroupBy] = useState<DashGroupBy>("none");

  const { mineList, delegatedList, overdueList, weekList, allList } =
    useMemo(() => {
      const today = new Date().toISOString().slice(0, 10);
      const wk = new Date();
      wk.setDate(wk.getDate() + 7);
      const weekIso = wk.toISOString().slice(0, 10);

      const mine = assigned.filter((t) => t.status !== "done");
      const deleg = delegated.filter((t) => t.status !== "done");
      // Combine + dedupe for cross-cutting tabs (overdue / week /
      // all). A task assigned to me AND created by me lands in
      // both source arrays; dedupe by id.
      const seen = new Set<string>();
      const combined: AssignedTask[] = [];
      for (const t of [...mine, ...deleg]) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        combined.push(t);
      }
      return {
        mineList: mine,
        delegatedList: deleg,
        overdueList: combined.filter(
          (t) => t.due_date && t.due_date < today,
        ),
        weekList: combined.filter(
          (t) =>
            t.due_date && t.due_date >= today && t.due_date <= weekIso,
        ),
        allList: combined,
      };
    }, [assigned, delegated]);

  const visibleAssigned: AssignedTask[] = (() => {
    switch (tab) {
      case "mine":
        return mineList;
      case "delegated":
        return delegatedList;
      case "overdue":
        return overdueList;
      case "week":
        return weekList;
      case "all":
        return allList;
    }
  })();

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
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-3 py-1.5">
        <FilterChip
          active={tab === "mine"}
          onClick={() => setTab("mine")}
          icon={<UserIcon className="h-3 w-3" />}
          label="Mine"
          count={mineList.length}
        />
        <FilterChip
          active={tab === "delegated"}
          onClick={() => setTab("delegated")}
          icon={<ArrowRight className="h-3 w-3" />}
          label="Delegated"
          count={delegatedList.length}
        />
        <FilterChip
          active={tab === "overdue"}
          onClick={() => setTab("overdue")}
          icon={<AlertOctagon className="h-3 w-3" />}
          label="Overdue"
          count={overdueList.length}
          tone={overdueList.length > 0 ? "danger" : "neutral"}
        />
        <FilterChip
          active={tab === "week"}
          onClick={() => setTab("week")}
          icon={<Clock className="h-3 w-3" />}
          label="Week"
          count={weekList.length}
        />
        <FilterChip
          active={tab === "all"}
          onClick={() => setTab("all")}
          icon={<Layers className="h-3 w-3" />}
          label="All"
          count={allList.length}
        />
        {/* Group-by selector. "Terminal" is the headline value here
            since the dashboard list spans terminals — bucketing per
            terminal turns the firehose into per-project micro-lists. */}
        <label className="ml-auto flex items-center gap-1 text-[10px]">
          <span className="font-mono uppercase tracking-wide text-text-3">
            Group
          </span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as DashGroupBy)}
            className="rounded-sm border border-border bg-bg-2 px-1 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-1 outline-none hover:border-border-focus focus:border-border-focus"
            aria-label="Group tasks by"
          >
            <option value="none">None</option>
            <option value="terminal">Terminal</option>
            <option value="priority">Priority</option>
            <option value="due">Due</option>
            {tab === "delegated" || tab === "all" ? (
              <option value="assignee">Assignee</option>
            ) : null}
          </select>
        </label>
      </div>
      {visibleAssigned.length === 0 ? (
        <p className="px-3 py-4 text-center text-[11px] text-text-3">
          {emptyForTab(tab)}
        </p>
      ) : groupBy === "none" ? (
        <ul className="divide-y divide-border/40">
          {visibleAssigned.slice(0, ROW_LIMIT).map((t) =>
            tab === "delegated" ? (
              <DelegatedRow
                key={t.id}
                task={t as DelegatedTask}
                ticker={tickerById[t.terminal_id]}
                terminalName={terminalNameById?.[t.terminal_id]}
              />
            ) : (
              <AssignedRow
                key={t.id}
                task={t}
                ticker={tickerById[t.terminal_id]}
                terminalName={terminalNameById?.[t.terminal_id]}
              />
            ),
          )}
        </ul>
      ) : (
        // Grouped: bucket per `groupBy`, render at most ROW_LIMIT
        // rows in total across all buckets so the card stays bounded.
        (() => {
          const buckets = bucketDashTasks(
            visibleAssigned,
            groupBy,
            tickerById,
            terminalNameById,
          );
          let rowsLeft = ROW_LIMIT;
          return (
            <div>
              {buckets.map((b) => {
                if (rowsLeft <= 0) return null;
                const slice = b.tasks.slice(0, rowsLeft);
                rowsLeft -= slice.length;
                return (
                  <section key={b.key}>
                    <header className="flex items-center justify-between border-b border-border/40 bg-bg-1 px-3 py-0.5">
                      <span className="font-mono text-[10px] uppercase tracking-wide text-text-2">
                        {b.label}
                      </span>
                      <span className="font-mono text-[10px] text-text-3">
                        {b.tasks.length}
                      </span>
                    </header>
                    <ul className="divide-y divide-border/40">
                      {slice.map((t) =>
                        tab === "delegated" ? (
                          <DelegatedRow
                            key={`${b.key}:${t.id}`}
                            task={t as DelegatedTask}
                            ticker={tickerById[t.terminal_id]}
                            terminalName={terminalNameById?.[t.terminal_id]}
                          />
                        ) : (
                          <AssignedRow
                            key={`${b.key}:${t.id}`}
                            task={t}
                            ticker={tickerById[t.terminal_id]}
                            terminalName={terminalNameById?.[t.terminal_id]}
                          />
                        ),
                      )}
                    </ul>
                  </section>
                );
              })}
            </div>
          );
        })()
      )}
      {visibleAssigned.length > ROW_LIMIT ? (
        <p className="px-3 py-1 text-center text-[10px] text-text-3">
          {visibleAssigned.length - ROW_LIMIT} more — open the full list
        </p>
      ) : null}
    </DashboardCard>
  );
}

function FilterChip({
  active,
  onClick,
  icon,
  label,
  count,
  tone = "neutral",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
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
        )}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * Bucket dashboard tasks for the group-by view.
 *
 *   terminal:  one bucket per terminal, label = "TICKER · Name"
 *   priority:  High → Medium → Low → No priority
 *   due:       Overdue → Today → This week → Later → No due date
 *   assignee:  one bucket per assignee (delegated tab only); falls
 *              back to a single "All" bucket if assignees aren't on
 *              the row (Mine / Overdue / etc. don't include them).
 */
function bucketDashTasks(
  tasks: AssignedTask[],
  by: "terminal" | "priority" | "due" | "assignee",
  tickerById: Record<string, string>,
  terminalNameById?: Record<string, string>,
): { key: string; label: string; tasks: AssignedTask[] }[] {
  if (by === "terminal") {
    const buckets = new Map<string, AssignedTask[]>();
    for (const t of tasks) {
      const key = t.terminal_id;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(t);
    }
    return Array.from(buckets.entries())
      .map(([key, list]) => {
        const ticker = tickerById[key] ?? "";
        const name = terminalNameById?.[key] ?? "";
        const label = ticker
          ? name
            ? `${ticker} · ${name}`
            : ticker
          : name || "Terminal";
        return { key, label, tasks: list };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  if (by === "priority") {
    const buckets: Record<string, AssignedTask[]> = {
      high: [],
      med: [],
      low: [],
      none: [],
    };
    for (const t of tasks) {
      const k =
        t.priority === 1
          ? "high"
          : t.priority === 2
            ? "med"
            : t.priority === 3
              ? "low"
              : "none";
      buckets[k].push(t);
    }
    return [
      { key: "high", label: "High", tasks: buckets.high },
      { key: "med", label: "Medium", tasks: buckets.med },
      { key: "low", label: "Low", tasks: buckets.low },
      { key: "none", label: "No priority", tasks: buckets.none },
    ].filter((g) => g.tasks.length > 0);
  }
  if (by === "due") {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    const endOfWeek = new Date(startOfDay);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    const buckets: Record<string, AssignedTask[]> = {
      overdue: [],
      today: [],
      week: [],
      later: [],
      none: [],
    };
    for (const t of tasks) {
      let key: string;
      if (!t.due_date) key = "none";
      else {
        const d = new Date(t.due_date).getTime();
        if (d < startOfDay.getTime()) key = "overdue";
        else if (d < endOfDay.getTime()) key = "today";
        else if (d < endOfWeek.getTime()) key = "week";
        else key = "later";
      }
      buckets[key].push(t);
    }
    return [
      { key: "overdue", label: "Overdue", tasks: buckets.overdue },
      { key: "today", label: "Today", tasks: buckets.today },
      { key: "week", label: "This week", tasks: buckets.week },
      { key: "later", label: "Later", tasks: buckets.later },
      { key: "none", label: "No due date", tasks: buckets.none },
    ].filter((g) => g.tasks.length > 0);
  }
  // assignee — only delegated rows carry the list
  const buckets = new Map<string, { label: string; tasks: AssignedTask[] }>();
  for (const t of tasks) {
    const list = (t as DelegatedTask).assignees ?? [];
    if (list.length === 0) {
      const acc = buckets.get("__none__") ?? {
        label: "Unassigned",
        tasks: [],
      };
      acc.tasks.push(t);
      buckets.set("__none__", acc);
      continue;
    }
    for (const a of list) {
      const key = a.user_id;
      const acc = buckets.get(key) ?? {
        label: a.full_name?.trim() || "Someone",
        tasks: [],
      };
      acc.tasks.push(t);
      buckets.set(key, acc);
    }
  }
  return Array.from(buckets.entries())
    .map(([key, v]) => ({ key, label: v.label, tasks: v.tasks }))
    .sort((a, b) => {
      if (a.key === "__none__") return 1;
      if (b.key === "__none__") return -1;
      return a.label.localeCompare(b.label);
    });
}

function emptyForTab(tab: "mine" | "delegated" | "overdue" | "week" | "all"): string {
  switch (tab) {
    case "mine":
      return "Nothing assigned to you. Nice.";
    case "delegated":
      return "Nothing waiting on others.";
    case "overdue":
      return "Nothing overdue. Well done.";
    case "week":
      return "Nothing due this week.";
    case "all":
      return "No open tasks anywhere.";
  }
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

// EmptyAssigned / EmptyDelegated removed — `emptyForTab` covers
// the per-filter empty state inline.

