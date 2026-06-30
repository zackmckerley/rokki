"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TaskSectionHeader, groupTone } from "@/components/TaskSectionHeader";
import { TaskListToolbar, type GroupOption } from "@/components/TaskListToolbar";
import { TaskRow } from "@/components/TaskRow";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { bucketDashTasks } from "@/lib/task-grouping";
import type { AssignedTask, DelegatedTask } from "@/lib/dashboard-queries";

const DASH_COLLAPSED_KEY = "rokki_dash_tasks_collapsed_groups";

/** Group-by options for the dashboard — same toolbar as the terminal,
 * plus "Terminal" (the cross-terminal headline grouping). */
const DASH_GROUP_OPTIONS: GroupOption[] = [
  { value: "none", label: "None" },
  { value: "due", label: "Due" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "terminal", label: "Terminal" },
  { value: "assignee", label: "Assignee" },
];

/** Client-side filter for dashboard tasks: title + terminal name. */
function filterDashTasks(
  tasks: AssignedTask[],
  query: string,
  terminalNameById?: Record<string, string>,
): AssignedTask[] {
  const q = query.trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter((t) => {
    if (t.title.toLowerCase().includes(q)) return true;
    const name = terminalNameById?.[t.terminal_id] ?? "";
    if (name.toLowerCase().includes(q)) return true;
    return false;
  });
}

interface TasksCardProps {
  assigned: AssignedTask[];
  delegated: DelegatedTask[];
  /** Map terminal_id → ticker for rendering the ticker chip. */
  tickerById: Record<string, string>;
  /** Optional terminal_id → display name. Rendered after the ticker chip. */
  terminalNameById?: Record<string, string>;
  /**
   * URL the "+ New task" button navigates to. Defaults to `/?new=task`,
   * which DashboardClient's existing `useSearchParams` effect catches
   * and opens the QuickTaskDialog. URL-based instead of a callback so
   * this card can be rendered as a Server Component slot (Server
   * Components can't accept event handlers as props).
   *
   * Pass `null` to hide the button entirely (e.g. on a page where
   * dialog wiring isn't available).
   */
  createHref?: string | null;
  /** Disable the create button (e.g. user has zero terminals). */
  createDisabled?: boolean;
  /**
   * When true, render every visible task (no ROW_LIMIT truncation,
   * no "X more" footer). The card body scrolls inside whatever
   * height the parent gives it — meant for full-page views like
   * `/tasks/mine` and `/tasks/delegated`. Default false, so the
   * dashboard card keeps its bounded "first 10" + footer behaviour.
   */
  expanded?: boolean;
}

/**
 * The dashboard task card. Presents the *exact* same interface as the
 * in-terminal `TasksPane` — same shared `TaskListToolbar` (Sort, Group,
 * Hide-done, Filter, New task) and same `TaskSectionHeader` sections —
 * so a user never has to relearn the list when moving between the
 * dashboard and a terminal.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Tasks 12   [Auto|Manual]  Group[Due▾]  Filter…  + New task │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ ▎● OVERDUE                                          ⟨2⟩    │
 *   │   task rows …                                             │
 *   │ ▎● THIS WEEK                                        ⟨5⟩    │
 *   │   task rows …                                             │
 *   └──────────────────────────────────────────────────────────┘
 *
 * The list spans terminals and merges everything relevant to you —
 * tasks assigned to you plus tasks you've delegated, deduped. The old
 * Mine/Delegated/Overdue/Week/All tabs are gone: Group→Due reproduces
 * the Overdue/Week sections and Group→Assignee surfaces who owes what.
 * Overflow scrolls within the card body.
 */
export function TasksCard({
  assigned,
  delegated,
  tickerById,
  terminalNameById,
  createHref = "/?new=task",
  createDisabled,
  expanded = false,
}: TasksCardProps) {
  // The cap is gone. Zack: "I could just keep on scrolling through
  // the tasks on my dashboard and see tasks that may not be showing."
  // The dashboard card already lives in a `flex-1 min-h-0
  // overflow-y-auto` body, so all rows render and the user scrolls
  // inside the card to reach the rest of the list. The
  // `expandHref` Maximize button in the card header still takes them
  // to the full-page view if they want more room.
  const ROW_LIMIT = Number.POSITIVE_INFINITY;
  // Kept for API back-compat with callers that still pass `expanded`.
  void expanded;

  const router = useRouter();
  // Debounce dashboard refreshes. Without this, a team-mate typing a
  // task title fires an onUpdate on every keystroke; each one runs
  // `router.refresh()` which re-fetches the whole RSC tree (Briefing,
  // Week, Tasks, Activity ticker, …). 30 keystrokes = 30 dashboard
  // refetches. Coalescing to one refresh per ~250ms makes the
  // dashboard usable during active editing.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 250);
  }, [router]);
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );
  useRealtimeTable<{ id: string }>(
    { table: "tasks", channelKey: "dash:tasks" },
    {
      onInsert: scheduleRefresh,
      onUpdate: scheduleRefresh,
      onDelete: scheduleRefresh,
    },
  );

  // Same toolbar as the in-terminal pane: Sort + Group + Hide-done +
  // Filter. The old Mine/Delegated/Overdue/Week/All tabs are gone —
  // grouping by Due gives the Overdue/Week sections, and the list now
  // shows everything relevant to you (assigned + delegated, deduped).
  type DashGroupBy =
    | "none"
    | "terminal"
    | "priority"
    | "due"
    | "assignee"
    | "status";
  // Sort is shown for parity; Manual (drag-reorder) is terminal-only,
  // so it stays disabled here. Auto = priority/due triage order.
  const [sortMode, setSortMode] = useState<"auto" | "manual">("auto");
  void sortMode;
  const [query, setQuery] = useState("");
  // Done tasks ARE fetched now; this toggle (hidden by default so the list
  // stays focused on open work) reveals completed tasks via "Show done".
  const [hideDone, setHideDone] = useState(true);
  // Starred-only filter — shows just the tasks pinned with a star.
  // Persisted globally so the choice sticks across reloads.
  const [starredOnly, setStarredOnly] = useState(false);
  // Default to grouping by due date so the dashboard task list opens in
  // the same sectioned view as the in-terminal pane (Overdue / Today /
  // This week / Later) instead of a flat list. Persisted globally so
  // the choice — including "Terminal" — sticks across loads.
  const [groupBy, setGroupBy] = useState<DashGroupBy>("due");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  // Hydrate + persist the group-by choice (global, not per-terminal —
  // the dashboard spans terminals).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("rokki_dash_tasks_group");
      if (
        saved === "none" ||
        saved === "terminal" ||
        saved === "priority" ||
        saved === "due" ||
        saved === "assignee" ||
        saved === "status"
      ) {
        setGroupBy(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("rokki_dash_tasks_group", groupBy);
    } catch {
      /* ignore */
    }
  }, [groupBy]);

  // Hydrate + persist the starred-only filter.
  useEffect(() => {
    try {
      setStarredOnly(
        window.localStorage.getItem("rokki_dash_tasks_starred") === "1",
      );
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "rokki_dash_tasks_starred",
        starredOnly ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [starredOnly]);

  // Hydrate + persist collapsed groups, keyed by `${groupBy}:${key}`.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DASH_COLLAPSED_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setCollapsedGroups(
            new Set(parsed.filter((v): v is string => typeof v === "string")),
          );
        }
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        DASH_COLLAPSED_KEY,
        JSON.stringify([...collapsedGroups]),
      );
    } catch {
      /* ignore */
    }
  }, [collapsedGroups]);

  const toggleGroupCollapsed = useCallback((collapseKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(collapseKey)) next.delete(collapseKey);
      else next.add(collapseKey);
      return next;
    });
  }, []);

  // All tasks relevant to you — assigned to me + delegated to others —
  // deduped (a task both assigned to and created by me lands in both
  // source arrays).
  const combined = useMemo(() => {
    const seen = new Set<string>();
    const out: AssignedTask[] = [];
    for (const t of [...assigned, ...delegated]) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
    return out;
  }, [assigned, delegated]);

  const doneCount = combined.filter((t) => t.status === "done").length;
  const visibleAssigned: AssignedTask[] = filterDashTasks(
    hideDone ? combined.filter((t) => t.status !== "done") : combined,
    query,
    terminalNameById,
  ).filter((t) => (starredOnly ? t.starred === true : true));

  return (
    // Plain card shell — no DashboardCard wrapper. The header chrome now
    // lives entirely in the shared TaskListToolbar so this surface is
    // byte-for-byte the same interface as the in-terminal TasksPane.
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--rk-card-radius)] border border-border-strong bg-bg-1 shadow-sm">
      <TaskListToolbar
        count={visibleAssigned.length}
        sortMode={sortMode}
        onSortMode={setSortMode}
        // Manual drag-to-reorder is a single-terminal concept; the
        // dashboard spans terminals, so the control shows for parity
        // but stays disabled.
        allowManual={false}
        groupMode={groupBy}
        onGroupMode={(m) => setGroupBy(m as DashGroupBy)}
        groupOptions={DASH_GROUP_OPTIONS}
        hideDone={hideDone}
        onHideDone={() => setHideDone((v) => !v)}
        doneCount={doneCount}
        starredOnly={starredOnly}
        onStarredOnly={() => setStarredOnly((v) => !v)}
        query={query}
        onQuery={setQuery}
        onNewTask={
          createHref == null
            ? undefined
            : () => {
                // Open the quick-task dialog IN PLACE via a cancelable event
                // the dashboard listens for — instead of navigating to
                // `/?new=task`. The navigation re-ran the page's server
                // component and refetched every streamed slot (Tasks / Week /
                // Ticker), which is the flash ("trippy") + delay Zack saw.
                // If no host is listening (e.g. a full-page task list with no
                // DashboardClient), fall back to the URL so the button still
                // works everywhere.
                const ev = new CustomEvent("rokki:open-new-task", {
                  cancelable: true,
                });
                const handled = !window.dispatchEvent(ev);
                if (!handled) router.push(createHref);
              }
        }
        newTaskDisabled={createDisabled}
        newTaskShortcut="⌘N"
        expandHref="/tasks/mine"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibleAssigned.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-text-3">
            {query.trim()
              ? "No tasks match your filter."
              : "No open tasks. Nice."}
          </p>
        ) : groupBy === "none" ? (
          <ul className="divide-y divide-border/40">
            {visibleAssigned.slice(0, ROW_LIMIT).map((t) => (
              <DashboardTaskRow
                key={t.id}
                task={t}
                ticker={tickerById[t.terminal_id]}
                terminalName={terminalNameById?.[t.terminal_id]}
              />
            ))}
          </ul>
        ) : (
          // Grouped — same sectioned treatment as the in-terminal pane:
          // sticky semantic headers, count pills, collapse, 2px dividers.
          (() => {
            const buckets = bucketDashTasks(
              visibleAssigned,
              groupBy,
              tickerById,
              terminalNameById,
            );
            return (
              <div className="divide-y divide-border">
                {buckets.map((b) => {
                  const collapseKey = `${groupBy}:${b.key}`;
                  const collapsed = collapsedGroups.has(collapseKey);
                  return (
                    <section key={b.key}>
                      <TaskSectionHeader
                        label={b.label}
                        count={b.tasks.length}
                        tone={groupTone(groupBy, b.key)}
                        collapsed={collapsed}
                        onToggle={() => toggleGroupCollapsed(collapseKey)}
                      />
                      {!collapsed ? (
                        <ul className="divide-y divide-border/40">
                          {b.tasks.map((t) => (
                            <DashboardTaskRow
                              key={`${b.key}:${t.id}`}
                              task={t}
                              ticker={tickerById[t.terminal_id]}
                              terminalName={terminalNameById?.[t.terminal_id]}
                            />
                          ))}
                        </ul>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            );
          })()
        )}
      </div>
    </section>
  );
}

/**
 * A dashboard task row. Thin wrapper that owns optimistic done/star
 * state and delegates ALL rendering to the shared {@link TaskRow}, so
 * the dashboard row is pixel-identical to the in-terminal pane —
 * square checkbox, amber star, priority left-edge + dots, status pill.
 * Toggling done or star PATCHes /api/v1/tasks/:id (same endpoint the
 * terminal uses) and reconciles on the next realtime-driven refresh.
 */
function DashboardTaskRow({
  task,
  ticker,
  terminalName,
}: {
  task: AssignedTask;
  ticker?: string;
  terminalName?: string;
}) {
  // Local optimistic overrides for the two togglable fields. Applied on
  // top of the server-provided task; cleared (rolled back) if the PATCH
  // fails. The dashboard refetches via realtime, which supersedes these.
  const [override, setOverride] = useState<
    Partial<Pick<AssignedTask, "status" | "starred">>
  >({});
  const merged: AssignedTask = { ...task, ...override };

  function rollback(patch: Partial<Pick<AssignedTask, "status" | "starred">>) {
    setOverride((o) => {
      const next = { ...o };
      for (const k of Object.keys(patch)) delete next[k as keyof typeof next];
      return next;
    });
  }

  async function commit(
    patch: Partial<Pick<AssignedTask, "status" | "starred">>,
  ) {
    setOverride((o) => ({ ...o, ...patch }));
    try {
      const r = await fetch(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok && r.status !== 202) rollback(patch);
    } catch {
      rollback(patch);
    }
  }

  return (
    <li>
      <TaskRow
        task={merged}
        ticker={ticker ?? ""}
        terminalName={terminalName}
        onToggle={() =>
          commit({ status: merged.status === "done" ? "todo" : "done" })
        }
        onToggleStar={() => commit({ starred: !merged.starred })}
      />
    </li>
  );
}

