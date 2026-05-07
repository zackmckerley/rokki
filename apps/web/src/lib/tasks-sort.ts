/**
 * Sort options for the task list pane.
 *
 * - `default`  → priority then due-date (matches the server ORDER BY).
 * - `due`      → due_date ascending; nulls last.
 * - `priority` → 1 (High) → 2 (Medium) → 3 (Low) → null (No priority).
 * - `assignee` → alphabetical by first assignee's full_name.
 * - `status`   → todo → in_progress → blocked → review → done.
 * - `created`  → newest first.
 * - `updated`  → most recently touched first.
 * - `manual`   → sparse `position` column; nulls last.
 *
 * The user's choice is mirrored to localStorage under
 * `rokki:tasks:sort` so reloads remember it.
 */
import type { TaskStatus } from "@rokki/db";

export const TASK_SORT_KEYS = [
  "default",
  "due",
  "priority",
  "assignee",
  "status",
  "created",
  "updated",
  "manual",
] as const;

export type TaskSortKey = (typeof TASK_SORT_KEYS)[number];

export const TASK_SORT_LABELS: Record<TaskSortKey, string> = {
  default: "Smart",
  due: "Due date",
  priority: "Priority",
  assignee: "Assignee",
  status: "Status",
  created: "Created",
  updated: "Updated",
  manual: "Manual",
};

const STATUS_RANK: Record<TaskStatus, number> = {
  todo: 0,
  in_progress: 1,
  blocked: 2,
  review: 3,
  done: 4,
};

const STORAGE_KEY = "rokki:tasks:sort";

export function loadTaskSort(): TaskSortKey {
  if (typeof window === "undefined") return "default";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && (TASK_SORT_KEYS as readonly string[]).includes(raw)) {
      return raw as TaskSortKey;
    }
  } catch {
    // localStorage may be unavailable (private browsing, SSR, etc.).
  }
  return "default";
}

export function saveTaskSort(key: TaskSortKey): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // ignore — persistence is best-effort.
  }
}

interface SortableTask {
  id: string;
  status: string;
  /** 1=High, 2=Medium, 3=Low, null=No priority. */
  priority: number | null;
  due_date: string | null;
  position: number | null;
  created_at: string;
  updated_at: string;
  assignees: { user_id: string; full_name: string | null }[];
}

/** Treat NULL priority as "infinity" — drops to the bottom of priority sorts. */
const priorityKey = (p: number | null | undefined): number =>
  p == null ? Number.POSITIVE_INFINITY : p;

/**
 * Stable sort. We pre-derive each comparison key and fall back to
 * created_at when the primary key ties, so two passes over the same data
 * always produce the same order (important for keyboard navigation
 * and for not making realtime updates jiggle the row a user is hovering).
 */
export function applyTaskSort<T extends SortableTask>(
  tasks: T[],
  key: TaskSortKey,
): T[] {
  const indexed = tasks.map((t, i) => ({ t, i }));

  const cmpCreatedDesc = (a: T, b: T) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

  const compareBy = (kind: TaskSortKey, a: T, b: T): number => {
    switch (kind) {
      case "due": {
        const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return ad - bd;
      }
      case "priority":
        return priorityKey(a.priority) - priorityKey(b.priority);
      case "assignee": {
        const an = (a.assignees[0]?.full_name ?? "").toLowerCase();
        const bn = (b.assignees[0]?.full_name ?? "").toLowerCase();
        // Empty (no assignee) sorts last so unattended tasks are out of the way.
        if (!an && bn) return 1;
        if (an && !bn) return -1;
        return an.localeCompare(bn);
      }
      case "status": {
        const aRank = STATUS_RANK[a.status as TaskStatus] ?? 99;
        const bRank = STATUS_RANK[b.status as TaskStatus] ?? 99;
        return aRank - bRank;
      }
      case "created":
        return cmpCreatedDesc(a, b);
      case "updated":
        return (
          new Date(b.updated_at).getTime() -
          new Date(a.updated_at).getTime()
        );
      case "manual": {
        const ap = a.position ?? Infinity;
        const bp = b.position ?? Infinity;
        return ap - bp;
      }
      case "default":
      default: {
        const p = priorityKey(a.priority) - priorityKey(b.priority);
        if (p !== 0) return p;
        const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return ad - bd;
      }
    }
  };

  indexed.sort((x, y) => {
    const primary = compareBy(key, x.t, y.t);
    if (primary !== 0) return primary;
    // Secondary: created desc keeps the order stable.
    const c = cmpCreatedDesc(x.t, y.t);
    if (c !== 0) return c;
    // Final tiebreaker: original index → guaranteed stable.
    return x.i - y.i;
  });

  return indexed.map((x) => x.t);
}
