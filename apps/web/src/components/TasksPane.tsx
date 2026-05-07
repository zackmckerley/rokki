"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Check,
  MessageSquare,
  Maximize2,
  ListTodo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { useRegisterCommands } from "@/lib/use-register-commands";
import { offlineFetch } from "@/lib/offline-fetch";
import { CommentThread } from "./CommentThread";
import { TaskComposer, type TaskComposerMember } from "./TaskComposer";
import { SubtasksList, type Subtask } from "./SubtasksList";
import {
  PriorityDots,
  StatusPill,
  DueChip,
} from "./primitives";
import type { TaskStatus } from "@rokki/db";

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

function sortStorageKey(projectId: string): string {
  return `rokki_tasks_sort:${projectId}`;
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
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const [commentTaskId, setCommentTaskId] = useState<string | null>(null);
  const [mentionables, setMentionables] = useState<Mentionable[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("auto");
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
  async function createTask(input: {
    title: string;
    priority: number | null;
    due_date: string | null;
    labels: string[];
    assignee_ids: string[];
  }) {
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
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-2 hover:bg-bg-2 hover:text-text-0"
        >
          <Plus className="h-3 w-3" /> New task <kbd className="ml-1 font-mono text-[10px] text-text-3">C</kbd>
        </button>
      </div>

      {error ? (
        <div className="border-b border-border bg-danger-subtle px-4 py-2 text-xs text-danger">
          {error}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonList />
        ) : tasks.length === 0 && !creating ? (
          <Empty onCreate={() => setCreating(true)} />
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map((t, i) => {
              const expanded = expandedTaskIds.has(t.id);
              const draggable = sortMode === "manual";
              const isDragOver = dragOverId === t.id && dragId !== t.id;
              return (
                <li
                  key={t.id}
                  draggable={draggable}
                  onDragStart={
                    draggable
                      ? (e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", t.id);
                          setDragId(t.id);
                        }
                      : undefined
                  }
                  onDragOver={
                    draggable
                      ? (e) => {
                          if (!dragId || dragId === t.id) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (dragOverId !== t.id) setDragOverId(t.id);
                        }
                      : undefined
                  }
                  onDragLeave={
                    draggable
                      ? () => {
                          if (dragOverId === t.id) setDragOverId(null);
                        }
                      : undefined
                  }
                  onDrop={
                    draggable
                      ? (e) => {
                          e.preventDefault();
                          const sourceId =
                            e.dataTransfer.getData("text/plain") || dragId;
                          setDragOverId(null);
                          setDragId(null);
                          if (sourceId)
                            void handleRowDrop(t.id, sourceId);
                        }
                      : undefined
                  }
                  onDragEnd={
                    draggable
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
                    draggable={draggable}
                    onClick={() => setSelectedIdx(i)}
                    onToggle={() => toggleComplete(t)}
                    onOpenComments={() =>
                      setCommentTaskId((prev) =>
                        prev === t.id ? null : t.id,
                      )
                    }
                    onToggleExpand={() => toggleExpand(t.id)}
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
}) {
  const done = task.status === "done";
  const subtaskTotal = task.subtask_total ?? 0;
  const subtaskDone = task.subtask_done ?? 0;

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
      <span
        className={cn(
          "flex-1 truncate text-sm",
          done ? "text-text-3 line-through" : "text-text-0",
        )}
      >
        {task.title}
      </span>
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
      {task.due_date ? <DueChip date={task.due_date} /> : null}
      <PriorityDots priority={task.priority} />
      <StatusPill status={task.status} />
    </div>
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

