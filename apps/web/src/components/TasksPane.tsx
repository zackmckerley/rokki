"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Check,
  MessageSquare,
  Maximize2,
  ListTodo,
  Repeat,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { useRegisterCommands } from "@/lib/use-register-commands";
import { offlineFetch } from "@/lib/offline-fetch";
// CommentThread is opened on demand (the user clicks the comment icon
// or hits `;`). Code-splitting it out trims the TasksPane bundle so
// the list renders sooner on first paint.
const CommentThread = dynamic(
  () => import("./CommentThread").then((m) => ({ default: m.CommentThread })),
  { ssr: false },
);
import {
  TaskComposer,
  type TaskComposerMember,
  type TaskComposerSubmit,
} from "./TaskComposer";
import { SubtasksList, type Subtask } from "./SubtasksList";
import {
  PriorityDots,
  StatusPill,
  DueChip,
} from "./primitives";
import { groupTasks, type TaskGroupMode } from "@/lib/task-grouping";
import type { TaskRecurrenceRule, TaskStatus } from "@rokki/db";

interface TaskAssignee {
  user_id: string;
  full_name: string | null;
}

interface Task {
  id: string;
  ticker_seq: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  /** 1=High, 2=Medium, 3=Low, null=No priority. */
  priority: number | null;
  due_date: string | null;
  labels: string[];
  latest_status_text?: string | null;
  latest_status_author_id?: string | null;
  latest_status_at?: string | null;
  assignees?: TaskAssignee[];
  external_assignee_emails?: string[];
  recurrence_rule?: TaskRecurrenceRule | null;
  /**
   * Sparse-integer manual-sort position. May be null for legacy rows
   * created before the column existed; the GET endpoint coerces NULLs
   * to the end of the list when sorting by position.
   */
  position: number | null;
  /** Subtask aggregate from the list endpoint — count without fetch. */
  subtask_total?: number;
  subtask_done?: number;
  created_at: string;
  completed_at: string | null;
}

type SortMode = "auto" | "manual";
/**
 * Group-by modes for the task list. "None" keeps the flat list. The
 * other modes bucket tasks visually with section headers; sorting
 * within a bucket still respects the active SortMode. Re-exported
 * from `lib/task-grouping` so the bucket logic + tests share one
 * source of truth.
 */
type GroupMode = TaskGroupMode;

function sortStorageKey(projectId: string): string {
  return `rokki_tasks_sort:${projectId}`;
}

function groupStorageKey(projectId: string): string {
  return `rokki_tasks_group:${projectId}`;
}

interface TasksPaneProps {
  ticker: string;
  projectId: string;
  /**
   * Current viewer's user_id. Used by the inline composer to
   * auto-assign-self by default — without this prop the composer
   * still works, but the assignee chip starts empty and the user
   * has to remember to click it.
   */
  currentUserId?: string;
}

/**
 * Task list pane (F3). Keyboard-first per docs/08_UI_DESIGN.md §8.6.3.
 *   J / K        — nav
 *   C            — create task inline
 *   Enter        — toggle complete on selected row
 *   ⌘Enter       — mark done
 *   ⌫            — delete (with undo toast, Phase 2)
 *
 * Stays live via Supabase Realtime — other collaborators' edits appear
 * without a refresh. Local mutations still refetch on error to guarantee
 * the UI doesn't desync if a policy blocks.
 */
interface Mentionable {
  user_id: string;
  full_name: string | null;
}

export function TasksPane({ ticker, projectId, currentUserId }: TasksPaneProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const [commentTaskId, setCommentTaskId] = useState<string | null>(null);
  const [mentionables, setMentionables] = useState<Mentionable[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("auto");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  /**
   * Client-side filter query. Matches against title + description +
   * labels + assignee names + `${ticker}-${seq}`. Empty string =
   * show everything. Filter happens before the group-by bucket
   * so headings reflect filtered counts.
   */
  const [query, setQuery] = useState("");
  /**
   * The id of the row currently being dragged (in Manual mode). Used
   * to skip drop highlighting on the source row and to look up its
   * neighbours when computing the new sparse position on drop.
   */
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Hydrate the per-project sort preference from localStorage on mount.
  // Per-project so a user can keep "Manual" on one terminal and "Auto"
  // on another without having to remember which is which.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(sortStorageKey(projectId));
      if (saved === "manual" || saved === "auto") setSortMode(saved);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(sortStorageKey(projectId), sortMode);
    } catch {
      /* ignore */
    }
  }, [projectId, sortMode]);

  // Hydrate + persist the group-by preference per project.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(groupStorageKey(projectId));
      if (
        saved === "none" ||
        saved === "assignee" ||
        saved === "due" ||
        saved === "priority" ||
        saved === "status"
      )
        setGroupMode(saved);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(groupStorageKey(projectId), groupMode);
    } catch {
      /* ignore */
    }
  }, [projectId, groupMode]);

  // Subtasks: lazily-loaded per parent. `null` = not yet fetched,
  // `[]` = fetched and empty. The expand toggle drives both
  // `expandedTaskIds` (visibility) and the first-fetch trigger.
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [subtasksByTaskId, setSubtasksByTaskId] = useState<
    Record<string, Subtask[] | null>
  >({});

  async function loadSubtasks(taskId: string) {
    setSubtasksByTaskId((prev) =>
      taskId in prev ? prev : { ...prev, [taskId]: null },
    );
    try {
      const r = await fetch(`/api/v1/tasks/${taskId}/subtasks`, {
        credentials: "include",
      });
      const body = (await r.json().catch(() => ({}))) as {
        data?: Subtask[];
      };
      setSubtasksByTaskId((prev) => ({
        ...prev,
        [taskId]: body.data ?? [],
      }));
    } catch {
      setSubtasksByTaskId((prev) => ({ ...prev, [taskId]: [] }));
    }
  }

  function toggleExpand(taskId: string) {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
        // Fire the lazy fetch the first time the row expands. Re-opening
        // a previously-loaded row reuses the cached array — no refetch.
        if (!(taskId in subtasksByTaskId)) {
          void loadSubtasks(taskId);
        }
      }
      return next;
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL(
        `/api/v1/projects/${ticker}/tasks`,
        window.location.origin,
      );
      if (sortMode === "manual") url.searchParams.set("sort", "position");
      // `cache: 'no-store'` bypasses both the browser HTTP cache
      // and our service-worker `staleWhileRevalidateApi` (which
      // bails on `Cache-Control: no-store` requests). Without
      // this, a dashboard→terminal navigation could land on the
      // SW's stale-cached task list and show one fewer task than
      // actually exists, until the user reloaded — see Zack's
      // "count is one behind" report after creating tasks via the
      // dashboard quick-create dialog.
      const r = await fetch(url.toString(), {
        credentials: "include",
        cache: "no-store",
      });
      const body = (await r.json()) as {
        data?: Task[];
        errors?: { message: string }[];
      };
      if (!r.ok) {
        setError(body.errors?.[0]?.message ?? "Failed to load tasks");
        return;
      }
      setTasks(body.data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [ticker, sortMode]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fetch project members once for the @mention picker.
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/v1/projects/${ticker}/members`, {
      credentials: "include",
    })
      .then((r) => r.json() as Promise<{ data?: { members?: { user_id: string; profiles: { full_name: string | null } | null }[] } }>)
      .then((body) => {
        if (cancelled) return;
        const ms = (body.data?.members ?? []).map((m) => ({
          user_id: m.user_id,
          full_name: m.profiles?.full_name ?? null,
        }));
        setMentionables(ms);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  // Realtime: mirror DB changes (inserts, updates, deletes) into local state
  // without refetching the whole list. RLS scopes the events to this user.
  const paletteCommands = useMemo(
    () => {
      const selected = tasks[selectedIdx];
      const base = [
        {
          id: `tasks/new:${projectId}`,
          title: "New task",
          category: "action" as const,
          icon: <Plus className="h-3.5 w-3.5" />,
          shortcut: "C",
          onRun: () => setCreating(true),
        },
      ];
      if (selected) {
        base.push(
          {
            id: `tasks/toggle:${projectId}`,
            title:
              selected.status === "done"
                ? `Reopen "${selected.title}"`
                : `Complete "${selected.title}"`,
            category: "action" as const,
            icon: <Check className="h-3.5 w-3.5" />,
            shortcut: "↵",
            onRun: () => toggleComplete(selected),
          },
          {
            id: `tasks/comment:${projectId}`,
            title: `Comments on "${selected.title}"`,
            category: "action" as const,
            icon: <MessageSquare className="h-3.5 w-3.5" />,
            shortcut: ";",
            onRun: () =>
              setCommentTaskId((prev) =>
                prev === selected.id ? null : selected.id,
              ),
          },
        );
      }
      return base;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, selectedIdx, projectId],
  );
  useRegisterCommands(`tasks:${projectId}`, paletteCommands);

  useRealtimeTable<Task>(
    {
      table: "tasks",
      filter: `terminal_id=eq.${projectId}`,
      channelKey: `tasks:${projectId}`,
    },
    {
      onInsert: (row) =>
        setTasks((prev) =>
          prev.some((t) => t.id === row.id)
            ? prev
            : sortTasks([row, ...prev], sortMode),
        ),
      onUpdate: (row) =>
        setTasks((prev) =>
          sortTasks(
            prev.map((t) => (t.id === row.id ? { ...t, ...row } : t)),
            sortMode,
          ),
        ),
      onDelete: (row) =>
        setTasks((prev) => prev.filter((t) => t.id !== row.id)),
    },
  );

  // Keyboard shortcuts (scoped — only fire when focus isn't in an input)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      if (e.key === "j") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, Math.max(tasks.length - 1, 0)));
      } else if (e.key === "k") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setCreating(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        const t = tasks[selectedIdx];
        if (t && t.status !== "done") void toggleComplete(t);
      } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        const t = tasks[selectedIdx];
        if (t) {
          e.preventDefault();
          void toggleComplete(t);
        }
      } else if (e.key === ";") {
        // Open the comment thread on the selected task.
        const t = tasks[selectedIdx];
        if (t) {
          e.preventDefault();
          setCommentTaskId((prev) => (prev === t.id ? null : t.id));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, selectedIdx]);

  /**
   * Handle a row drop in Manual mode. We compute a sparse-integer
   * position halfway between the destination's neighbour and the
   * destination itself — same trick the subtask reorder uses
   * (`(prev + next) / 2`). PATCH the new position, optimistic-update
   * the local list, and let the realtime channel reconcile.
   */
  async function handleRowDrop(targetId: string, sourceId: string) {
    if (targetId === sourceId) return;
    const idxs = new Map(tasks.map((t, i) => [t.id, i]));
    const fromIdx = idxs.get(sourceId);
    const toIdx = idxs.get(targetId);
    if (fromIdx === undefined || toIdx === undefined) return;

    // Build the new visual order so we can pick neighbours from it,
    // not from the unmoved list.
    const next = [...tasks];
    const [moved] = next.splice(fromIdx, 1);
    // Inserting after `toIdx`: drop AT the target's position when the
    // user dragged downward, BEFORE the target when dragging upward.
    // Visual convention: dropping ON a row places the source ABOVE
    // it (matches the way the highlight reads as "I'm landing here").
    const insertAt = fromIdx < toIdx ? toIdx : toIdx;
    next.splice(insertAt, 0, moved);

    const movedIdx = next.findIndex((t) => t.id === sourceId);
    const before = movedIdx > 0 ? next[movedIdx - 1].position : null;
    const after =
      movedIdx < next.length - 1 ? next[movedIdx + 1].position : null;

    let newPos: number;
    if (before == null && after == null) {
      newPos = 1000;
    } else if (before == null && after != null) {
      newPos = after - 1000;
    } else if (after == null && before != null) {
      newPos = before + 1000;
    } else {
      newPos = ((before as number) + (after as number)) / 2;
    }

    // Optimistic — apply the new order locally with the new position
    // baked in. Mismatch on the network is reconciled by `load()`.
    setTasks(
      next.map((t) => (t.id === sourceId ? { ...t, position: newPos } : t)),
    );

    try {
      const r = await fetch(`/api/v1/tasks/${sourceId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: newPos }),
      });
      if (!r.ok) {
        setError(`Reorder failed (HTTP ${r.status})`);
        await load();
      }
    } catch {
      setError("Network error during reorder");
      await load();
    }
  }

  /**
   * Rename a task in-place from the list. Called when the user hits
   * Enter on the inline editor or blurs with a different title than
   * the original. PATCHes `title` only; uses the row's
   * `updated_at` as an optimistic-concurrency token so a stale
   * keypress can't clobber someone else's concurrent edit.
   *
   * Optimistic UI: title flips on call, server-truth wins on
   * response (rolls back on 4xx/5xx). The realtime channel
   * reconciles the rest.
   */
  async function renameTask(task: Task, nextTitle: string) {
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === task.title) return;
    if (trimmed.length > 300) {
      setError("title must be ≤ 300 characters");
      return;
    }
    // Optimistic flip.
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, title: trimmed } : t)),
    );
    try {
      const r = await fetch(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!r.ok) {
        if (r.status === 409) {
          // Someone else's edit landed first. Reload the list to
          // pull the canonical title and let the user retry.
          setError(
            "Title was edited elsewhere — reloading. Please retry.",
          );
        } else {
          const body = (await r.json().catch(() => ({}))) as {
            errors?: { message: string }[];
          };
          setError(
            body.errors?.[0]?.message ?? `Rename failed (HTTP ${r.status})`,
          );
        }
        await load();
      } else {
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      await load();
    }
  }

  /**
   * Ping the task's assignees with a "what's the status?" message
   * via the messenger. Backend creates/reuses a `status_thread` and
   * delivers a notification to each assignee. UX is intentionally
   * quiet: the requester sees the row stay put, the assignee sees
   * a notification + DM/group thread. We pop a tiny inline notice
   * so the requester knows the ping fired.
   */
  async function requestUpdate(task: Task) {
    try {
      const r = await fetch(`/api/v1/tasks/${task.id}/request-update`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(
          body.errors?.[0]?.message ??
            `Failed to request update (HTTP ${r.status})`,
        );
        return;
      }
      setError(null);
      setStatusNotice(`Ping sent for "${task.title}"`);
      window.setTimeout(() => setStatusNotice(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    }
  }

  async function toggleComplete(task: Task) {
    const nextStatus: TaskStatus = task.status === "done" ? "todo" : "done";
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: nextStatus,
              completed_at: nextStatus === "done" ? new Date().toISOString() : null,
            }
          : t,
      ),
    );
    try {
      const r = await offlineFetch(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
        label: `Mark "${task.title}" as ${nextStatus}`,
      });
      // 202 == queued offline; the optimistic update already reflects the
      // new status. Anything else non-OK rolls back.
      if (!r.ok && r.status !== 202) await load();
    } catch {
      await load();
    }
  }

  /**
   * POST a fully-formed task (title + chips) to the project's tasks
   * endpoint. The TaskComposer hands us the structured payload; we
   * just translate it into the API's body shape and reload on
   * success. Throws on failure so the composer can surface the error
   * inline.
   */
  async function createTask(input: TaskComposerSubmit) {
    const r = await offlineFetch(`/api/v1/projects/${ticker}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        priority: input.priority,
        due_date: input.due_date,
        labels: input.labels,
        assignee_ids:
          input.assignee_ids.length > 0 ? input.assignee_ids : undefined,
        external_assignee_emails:
          input.external_assignee_emails.length > 0
            ? input.external_assignee_emails
            : undefined,
        recurrence_rule: input.recurrence_rule,
      }),
      label: `Create task: ${input.title}`,
    });
    if (!r.ok && r.status !== 202) {
      const body = (await r.json().catch(() => ({}))) as {
        errors?: { message: string }[];
      };
      throw new Error(
        body.errors?.[0]?.message ?? `Failed to create (HTTP ${r.status})`,
      );
    }
    setCreating(false);
    if (r.status !== 202) await load();
  }

  function cancelCreate() {
    setCreating(false);
  }

  const commentTask = tasks.find((t) => t.id === commentTaskId) ?? null;

  return (
    <div className="flex h-full">
      <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-text-0">Tasks</h2>
          <span className="font-mono text-xs text-text-3">{tasks.length}</span>
          {/* Sort toggle. "Auto" is the natural triage order
              (incomplete first, then priority, due, created).
              "Manual" loads `?sort=position` so drag-to-reorder
              writes back to the position column. The current mode
              persists per-project in localStorage. */}
          <span
            role="tablist"
            aria-label="Task sort order"
            className="flex items-center gap-0 overflow-hidden rounded-sm border border-border text-[10px]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={sortMode === "auto"}
              onClick={() => setSortMode("auto")}
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
              onClick={() => setSortMode("manual")}
              className={cn(
                "px-2 py-0.5 font-mono uppercase tracking-wide",
                sortMode === "manual"
                  ? "bg-bg-3 text-text-0"
                  : "text-text-3 hover:bg-bg-2 hover:text-text-1",
              )}
            >
              Manual
            </button>
          </span>
          {/* Group-by selector. Buckets the list visually with section
              headers; rows still sort by the active SortMode within
              each bucket. Persists per-project. */}
          <label className="flex items-center gap-1 text-[10px]">
            <span className="font-mono uppercase tracking-wide text-text-3">
              Group
            </span>
            <select
              value={groupMode}
              onChange={(e) => setGroupMode(e.target.value as GroupMode)}
              className="rounded-sm border border-border bg-bg-1 px-1 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-1 outline-none hover:border-border-focus focus:border-border-focus"
              aria-label="Group tasks by"
            >
              <option value="none">None</option>
              <option value="assignee">Assignee</option>
              <option value="due">Due</option>
              <option value="priority">Priority</option>
              <option value="status">Status</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <TaskSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Filter tasks…"
          />
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-2 hover:bg-bg-2 hover:text-text-0"
          >
            <Plus className="h-3 w-3" /> New task <kbd className="ml-1 font-mono text-[10px] text-text-3">C</kbd>
          </button>
        </div>
      </div>

      {error ? (
        <div className="border-b border-border bg-danger-subtle px-4 py-2 text-xs text-danger">
          {error}
        </div>
      ) : null}

      {statusNotice ? (
        <div className="border-b border-border bg-accent-subtle px-4 py-2 text-xs text-accent">
          {statusNotice}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonList />
        ) : tasks.length === 0 && !creating ? (
          <Empty onCreate={() => setCreating(true)} />
        ) : (
          (() => {
            // Manual drag-reorder writes to the position column with no
            // bucket semantics — disable it when grouped OR filtered to
            // avoid a confusing "drag worked but the row didn't move"
            // UX.
            const filtered = filterTasks(tasks, query, ticker);
            const dragEnabled =
              sortMode === "manual" && groupMode === "none" && !query.trim();
            const groups = groupTasks(filtered, groupMode);
            // Map task.id → its index in the global `tasks` array so
            // selectedIdx (driven by j/k) keeps working across buckets.
            const idxById = new Map(tasks.map((t, i) => [t.id, i]));
            if (filtered.length === 0 && query.trim()) {
              return (
                <p className="px-4 py-10 text-center text-xs text-text-3">
                  No tasks match{" "}
                  <span className="font-mono text-text-1">
                    &ldquo;{query.trim()}&rdquo;
                  </span>
                  .
                </p>
              );
            }
            return (
              <div>
                {groups.map((group) => (
                  <section key={group.key}>
                    {group.label ? (
                      <header className="sticky top-0 z-[1] flex items-center justify-between border-b border-border bg-bg-1 px-4 py-1">
                        <span className="font-mono text-[10px] uppercase tracking-wide text-text-2">
                          {group.label}
                        </span>
                        <span className="font-mono text-[10px] text-text-3">
                          {group.tasks.length}
                        </span>
                      </header>
                    ) : null}
                    <ul className="divide-y divide-border">
                      {group.tasks.map((t) => {
                        const i = idxById.get(t.id) ?? 0;
                        const expanded = expandedTaskIds.has(t.id);
                        const isDragOver =
                          dragOverId === t.id && dragId !== t.id;
                        return (
                          <li
                            key={`${group.key}:${t.id}`}
                            draggable={dragEnabled}
                            onDragStart={
                              dragEnabled
                                ? (e) => {
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("text/plain", t.id);
                                    setDragId(t.id);
                                  }
                                : undefined
                            }
                            onDragOver={
                              dragEnabled
                                ? (e) => {
                                    if (!dragId || dragId === t.id) return;
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                    if (dragOverId !== t.id) setDragOverId(t.id);
                                  }
                                : undefined
                            }
                            onDragLeave={
                              dragEnabled
                                ? () => {
                                    if (dragOverId === t.id) setDragOverId(null);
                                  }
                                : undefined
                            }
                            onDrop={
                              dragEnabled
                                ? (e) => {
                                    e.preventDefault();
                                    const sourceId =
                                      e.dataTransfer.getData("text/plain") ||
                                      dragId;
                                    setDragOverId(null);
                                    setDragId(null);
                                    if (sourceId)
                                      void handleRowDrop(t.id, sourceId);
                                  }
                                : undefined
                            }
                            onDragEnd={
                              dragEnabled
                                ? () => {
                                    setDragId(null);
                                    setDragOverId(null);
                                  }
                                : undefined
                            }
                            className={cn(
                              isDragOver &&
                                "outline outline-2 -outline-offset-2 outline-accent",
                              dragId === t.id && "opacity-50",
                            )}
                          >
                            <TaskRow
                              task={t}
                              ticker={ticker}
                              selected={i === selectedIdx}
                              expanded={expanded}
                              draggable={dragEnabled}
                              onClick={() => setSelectedIdx(i)}
                              onToggle={() => toggleComplete(t)}
                              onOpenComments={() =>
                                setCommentTaskId((prev) =>
                                  prev === t.id ? null : t.id,
                                )
                              }
                              onToggleExpand={() => toggleExpand(t.id)}
                              onRequestUpdate={() => requestUpdate(t)}
                              onRename={(next) => renameTask(t, next)}
                            />
                            {expanded ? (
                              <SubtasksList
                                taskId={t.id}
                                subtasks={subtasksByTaskId[t.id] ?? null}
                                onChange={(next) =>
                                  setSubtasksByTaskId((prev) => ({
                                    ...prev,
                                    [t.id]: next,
                                  }))
                                }
                              />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            );
          })()
        )}

        {creating ? (
          <TaskComposer
            members={mentionables as TaskComposerMember[]}
            currentUserId={currentUserId}
            onSubmit={createTask}
            onCancel={cancelCreate}
            submitLabel="Create"
          />
        ) : null}
      </div>
      </div>
      {commentTask ? (
        <div className="h-full w-[320px] flex-shrink-0">
          <CommentThread
            entityType="task"
            entityId={commentTask.id}
            projectId={projectId}
            mentionables={mentionables}
            label={commentTask.title}
            onClose={() => setCommentTaskId(null)}
          />
        </div>
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  ticker,
  selected,
  expanded,
  draggable,
  onClick,
  onToggle,
  onOpenComments,
  onToggleExpand,
  onRequestUpdate,
  onRename,
}: {
  task: Task;
  ticker: string;
  selected: boolean;
  expanded: boolean;
  draggable: boolean;
  onClick: () => void;
  onToggle: () => void;
  onOpenComments: () => void;
  onToggleExpand: () => void;
  onRequestUpdate: () => void;
  /**
   * Persist a renamed title. Called when the user blurs / hits
   * Enter on the inline-edit input. Receives the trimmed new title;
   * implementation handles validation + PATCH + optimistic rollback.
   */
  onRename: (nextTitle: string) => void;
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

  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex cursor-pointer items-center gap-2 px-2 py-2.5 transition-colors",
        selected ? "bg-bg-2" : "hover:bg-bg-2",
        selected && "border-l-2 border-l-border-focus pl-[6px]",
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
      <button
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
        <InlineTitleEditor
          title={task.title}
          done={done}
          onCommit={onRename}
        />
        {status ? (
          <span
            className="flex items-center gap-1 truncate text-[11px] leading-tight text-text-2"
            title={status}
          >
            <span className="font-mono text-[9px] uppercase tracking-wide text-text-3">
              Status
            </span>
            <span className="truncate">{status}</span>
          </span>
        ) : null}
      </div>
      {/* Subtask roll-up — surfaces the count without expanding. The
          list endpoint already returns subtask_total/subtask_done
          aggregates, so this is free. */}
      {subtaskTotal > 0 ? (
        <span
          className="flex-shrink-0 rounded-sm bg-bg-3 px-1 font-mono text-[10px] text-text-2"
          title={`${subtaskDone} of ${subtaskTotal} subtasks done`}
        >
          {subtaskDone}/{subtaskTotal}
        </span>
      ) : null}
      {externalCount > 0 ? (
        <span
          className="flex-shrink-0 rounded-sm border border-border bg-bg-2 px-1 font-mono text-[10px] uppercase tracking-wide text-text-2"
          title={externalEmailsTitle}
        >
          @+{externalCount}
        </span>
      ) : null}
      <Link
        href={`/p/${ticker}/task/${task.ticker_seq}`}
        onClick={(e) => e.stopPropagation()}
        aria-label="Open task detail"
        className="rounded-sm p-1 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-text-0 group-hover:opacity-100"
      >
        <Maximize2 className="h-3 w-3" />
      </Link>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenComments();
        }}
        aria-label="Comments"
        className="rounded-sm p-1 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-text-0 group-hover:opacity-100"
      >
        <MessageSquare className="h-3 w-3" />
      </button>
      <button
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
      {task.due_date ? <DueChip date={task.due_date} /> : null}
      {task.recurrence_rule ? (
        <span
          className="flex flex-shrink-0 items-center gap-0.5 rounded-sm border border-border bg-bg-2 px-1 py-0.5 text-[10px] uppercase tracking-wide text-text-2"
          title={`Repeats ${recurrenceLabel(task.recurrence_rule)}`}
        >
          <Repeat className="h-2.5 w-2.5" aria-hidden="true" />
          {recurrenceShortLabel(task.recurrence_rule)}
        </span>
      ) : null}
      <PriorityDots priority={task.priority} />
      <StatusPill status={task.status} />
    </div>
  );
}

/** Long form for tooltips: "Daily", "Weekly", "Monthly ×2". */
function recurrenceLabel(rule: TaskRecurrenceRule): string {
  const base =
    rule.pattern === "daily"
      ? "Daily"
      : rule.pattern === "weekly"
        ? "Weekly"
        : "Monthly";
  return rule.interval > 1 ? `${base} ×${rule.interval}` : base;
}

/** Single-char chip glyph: "D", "W", "M" (+ optional interval). */
function recurrenceShortLabel(rule: TaskRecurrenceRule): string {
  const letter =
    rule.pattern === "daily" ? "D" : rule.pattern === "weekly" ? "W" : "M";
  return rule.interval > 1 ? `${letter}${rule.interval}` : letter;
}

/**
 * Inline title editor for a task row. Renders as a plain `<span>` in
 * its default state — double-click (or hit Enter when the row is
 * selected) flips to a focused `<input>`. Enter commits, Escape
 * cancels, blur commits the current value.
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
  onCommit,
}: {
  title: string;
  done: boolean;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
          "truncate text-sm",
          done ? "text-text-3 line-through" : "text-text-0",
        )}
        title="Double-click to rename"
        onDoubleClick={(e) => {
          e.stopPropagation();
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

function SkeletonList() {
  return (
    <ul className="divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-2.5">
          <span className="h-4 w-4 rounded-sm bg-bg-3" />
          <span className="w-20 h-3 rounded-sm bg-bg-3" />
          <span className="flex-1 h-3 rounded-sm bg-bg-3" />
        </li>
      ))}
    </ul>
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={ListTodo}
      title="No tasks yet."
      body="Tasks track work in this terminal — assignees, due dates, status."
      action={{
        label: "+ New task",
        onClick: onCreate,
        variant: "accent",
        shortcut: "C",
      }}
      className="p-10"
    />
  );
}

/**
 * Stable sort mirroring the server's ORDER BY. In "auto" mode this is
 * status → priority → due → created (matches the GET endpoint). In
 * "manual" mode it sorts by `position ASC` with NULL positions last
 * (newly-created rows haven't picked up a position yet) — matches
 * the server's `?sort=position` order.
 *
 * Realtime inserts/updates arrive out of order; running the same
 * comparison the server uses keeps the visible list deterministic.
 */
function sortTasks(tasks: Task[], mode: SortMode = "auto"): Task[] {
  if (mode === "manual") {
    return [...tasks].sort((a, b) => {
      const ap = a.position ?? Number.POSITIVE_INFINITY;
      const bp = b.position ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }
  const rank: Record<TaskStatus, number> = {
    todo: 0,
    in_progress: 1,
    review: 2,
    blocked: 3,
    done: 4,
  };
  // null priority sorts after 1..3 (matches the server ORDER BY).
  const pkey = (p: number | null | undefined): number =>
    p == null ? Number.POSITIVE_INFINITY : p;
  return [...tasks].sort((a, b) => {
    const s = rank[a.status] - rank[b.status];
    if (s !== 0) return s;
    const p = pkey(a.priority) - pkey(b.priority);
    if (p !== 0) return p;
    const da = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
    const db = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}



/* --------------------------------------------------------------- */
/* Task search                                                       */
/* --------------------------------------------------------------- */

/**
 * Client-side filter. Searches title, description, labels, assignee
 * names, and the `TICKER-N` deep-link identifier. All matching is
 * case-insensitive substring. Returns the original `tasks` array
 * when query is empty so React reference-equality lets the parent
 * skip unchanged work.
 *
 * Deliberately client-only — at our current per-terminal volume
 * (hundreds of tasks max) this is faster than a round-trip and
 * lets us highlight matches without a refetch.
 */
function filterTasks(tasks: Task[], query: string, ticker: string): Task[] {
  const q = query.trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter((t) => {
    if (t.title.toLowerCase().includes(q)) return true;
    if (t.description?.toLowerCase().includes(q)) return true;
    if (t.labels?.some((l) => l.toLowerCase().includes(q))) return true;
    if (
      t.assignees?.some((a) =>
        (a.full_name ?? "").toLowerCase().includes(q),
      )
    )
      return true;
    // TICKER-N: e.g. "HELIOS-42" or just "42". Tolerate either.
    const tickerSeq = `${ticker}-${t.ticker_seq}`.toLowerCase();
    if (tickerSeq.includes(q)) return true;
    return false;
  });
}

/**
 * Toolbar search input. Visible always so the affordance is
 * discoverable; `f` from anywhere outside an input focuses it.
 * `Escape` clears the query and blurs.
 */
function TaskSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement | null>(null);

  // Window-level `f` shortcut to focus this input. Guards against
  // firing while typing in another input/textarea so it doesn't
  // steal a real keystroke.
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
        placeholder={placeholder ?? "Filter…"}
        aria-label="Filter tasks"
        className="w-44 rounded-sm border border-border bg-bg-1 px-2 py-1 pr-6 text-xs text-text-0 placeholder:text-text-3 outline-none focus:border-border-focus"
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
        <kbd className="absolute right-1 font-mono text-[10px] text-text-3">
          f
        </kbd>
      )}
    </div>
  );
}
