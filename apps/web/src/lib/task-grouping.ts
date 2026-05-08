/**
 * Bucket helpers for the task list group-by view.
 *
 * Two consumers:
 *
 *   - In-terminal `TasksPane` — groups by assignee / due / priority /
 *     status (terminal context already pins the space + project).
 *   - Dashboard `TasksCard` — groups by terminal / priority / due /
 *     assignee (cross-cutting view, terminal-grouping is the headline
 *     value here since the dashboard list spans terminals).
 *
 * Both surfaces render the result as section headers + a count chip.
 * Empty buckets are dropped so the layout doesn't waste vertical
 * space on "0 tasks" headers.
 */

export type TaskGroupMode =
  | "none"
  | "assignee"
  | "due"
  | "priority"
  | "status";

/**
 * Minimal shape needed to bucket. Both `TasksPane.Task` and
 * `dashboard.AssignedTask` satisfy it (with the assignees field
 * optional — the dashboard's "Mine" tab doesn't carry one).
 */
export interface GroupableTask {
  id: string;
  status: string;
  priority: number | null;
  due_date: string | null;
  assignees?: { user_id: string; full_name: string | null }[];
}

export interface TaskGroup<T> {
  key: string;
  label: string;
  tasks: T[];
}

/**
 * Group an in-terminal task list. The "none" mode returns a single
 * unlabeled group containing every task — matches the flat list
 * rendering and avoids special-casing in the renderer.
 */
export function groupTasks<T extends GroupableTask>(
  tasks: T[],
  mode: TaskGroupMode,
): TaskGroup<T>[] {
  if (mode === "none" || tasks.length === 0) {
    return [{ key: "all", label: "", tasks }];
  }

  if (mode === "assignee") return bucketByAssignee(tasks);
  if (mode === "due") return bucketByDue(tasks);
  if (mode === "priority") return bucketByPriority(tasks);
  return bucketByStatus(tasks);
}

/**
 * Group dashboard tasks. Terminal-grouping is the headline value
 * here; the rest mirror the in-terminal pane's modes.
 *
 * Falls through to `groupTasks` for the shared modes so the bucket
 * logic only lives in one place.
 */
export type DashGroupMode =
  | "none"
  | "terminal"
  | "priority"
  | "due"
  | "assignee";

export interface DashGroupableTask extends GroupableTask {
  terminal_id: string;
}

export function bucketDashTasks<T extends DashGroupableTask>(
  tasks: T[],
  by: DashGroupMode,
  tickerById: Record<string, string>,
  terminalNameById?: Record<string, string>,
): TaskGroup<T>[] {
  if (by === "none" || tasks.length === 0) {
    return [{ key: "all", label: "", tasks }];
  }
  if (by === "terminal") {
    const buckets = new Map<string, T[]>();
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
  // Reuse the in-terminal helpers for shared modes.
  return groupTasks(tasks, by);
}

/* ------------------------------------------------------------------ */
/* Bucket implementations                                               */
/* ------------------------------------------------------------------ */

function bucketByAssignee<T extends GroupableTask>(tasks: T[]): TaskGroup<T>[] {
  const buckets = new Map<string, { label: string; tasks: T[] }>();
  for (const t of tasks) {
    const list = t.assignees ?? [];
    if (list.length === 0) {
      const acc = buckets.get("__none__") ?? {
        label: "Unassigned",
        tasks: [],
      };
      acc.tasks.push(t);
      buckets.set("__none__", acc);
      continue;
    }
    // Tasks with multiple assignees show up under each one — when
    // grouping by assignee the user expects "show me what each
    // person owes me", not "pick one canonical owner."
    for (const a of list) {
      const acc = buckets.get(a.user_id) ?? {
        label: a.full_name?.trim() || "Someone",
        tasks: [],
      };
      acc.tasks.push(t);
      buckets.set(a.user_id, acc);
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

function bucketByDue<T extends GroupableTask>(tasks: T[]): TaskGroup<T>[] {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const endOfWeek = new Date(startOfDay);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const order = ["overdue", "today", "week", "later", "none"] as const;
  const buckets: Record<(typeof order)[number], T[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    none: [],
  };
  for (const t of tasks) {
    let key: (typeof order)[number];
    if (!t.due_date) key = "none";
    else {
      // Parse YYYY-MM-DD as a local-midnight Date — `new Date(iso)`
      // treats bare date strings as UTC, which puts a "today" task
      // in the previous day's bucket for users east of UTC. The
      // explicit constructor pins it to the user's local calendar.
      const [y, mo, d] = t.due_date.split("-").map(Number);
      const due = new Date(y, (mo ?? 1) - 1, d ?? 1).getTime();
      if (due < startOfDay.getTime()) key = "overdue";
      else if (due < endOfDay.getTime()) key = "today";
      else if (due < endOfWeek.getTime()) key = "week";
      else key = "later";
    }
    buckets[key].push(t);
  }
  const labels: Record<string, string> = {
    overdue: "Overdue",
    today: "Today",
    week: "This week",
    later: "Later",
    none: "No due date",
  };
  return order
    .map((k) => ({ key: k, label: labels[k], tasks: buckets[k] }))
    .filter((g) => g.tasks.length > 0);
}

function bucketByPriority<T extends GroupableTask>(tasks: T[]): TaskGroup<T>[] {
  const buckets: Record<string, T[]> = {
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

function bucketByStatus<T extends GroupableTask>(tasks: T[]): TaskGroup<T>[] {
  const order = ["todo", "in_progress", "review", "blocked", "done"] as const;
  const labels: Record<string, string> = {
    todo: "To do",
    in_progress: "In progress",
    review: "Review",
    blocked: "Blocked",
    done: "Done",
  };
  const buckets = new Map<string, T[]>();
  for (const s of order) buckets.set(s, []);
  for (const t of tasks) {
    if (buckets.has(t.status)) buckets.get(t.status)!.push(t);
    else {
      // Unknown status — bucket under "todo" so the row still shows.
      // (Shouldn't happen — status is enum'd in the DB — but the
      // group logic stays defensive against schema drift.)
      buckets.get("todo")!.push(t);
    }
  }
  return order
    .map((s) => ({ key: s, label: labels[s], tasks: buckets.get(s) ?? [] }))
    .filter((g) => g.tasks.length > 0);
}
