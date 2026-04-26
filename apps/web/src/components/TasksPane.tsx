"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Check,
  Circle,
  MessageSquare,
  Maximize2,
  ListChecks,
  ArrowDownUp,
  ChevronDown,
  GripVertical,
  X,
  Trash2,
  UserPlus,
  Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { useRegisterCommands } from "@/lib/use-register-commands";
import { CommentThread } from "./CommentThread";
import {
  PriorityDots,
  StatusPill,
  DueChip,
  Avatar,
} from "./primitives";
import {
  TASK_SORT_KEYS,
  TASK_SORT_LABELS,
  applyTaskSort,
  loadTaskSort,
  saveTaskSort,
  type TaskSortKey,
} from "@/lib/tasks-sort";
import type { TaskStatus } from "@rokki/db";

interface Assignee {
  user_id: string;
  full_name: string | null;
}

interface Task {
  id: string;
  ticker_seq: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  due_date: string | null;
  labels: string[];
  /** Sparse INT — populated by the manual-reorder migration; null otherwise. */
  position: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** New: server-aggregated subtask completion. */
  subtask_total: number;
  subtask_done: number;
  /** New: assignees with display names for the row preview. */
  assignees: Assignee[];
}

interface TasksPaneProps {
  ticker: string;
  projectId: string;
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

export function TasksPane({ ticker, projectId }: TasksPaneProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentTaskId, setCommentTaskId] = useState<string | null>(null);
  const [mentionables, setMentionables] = useState<Mentionable[]>([]);
  // Sort key persists to localStorage. Default = priority then due_date.
  const [sortKey, setSortKey] = useState<TaskSortKey>("default");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // Multi-select. Anchor is the row a shift-click extends from.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  // Drag state for manual reorder. Only active when sortKey === "manual".
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const createRef = useRef<HTMLInputElement>(null);

  // Restore the user's saved sort on mount.
  useEffect(() => {
    setSortKey(loadTaskSort());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/v1/projects/${ticker}/tasks`, {
        credentials: "include",
      });
      const body = (await r.json()) as { data?: Task[]; errors?: { message: string }[] };
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
  }, [ticker]);

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

  // Apply the active sort once per render so every consumer (rows, keyboard
  // nav, command palette) sees the same order.
  const sortedTasks = useMemo(
    () => applyTaskSort(tasks, sortKey),
    [tasks, sortKey],
  );

  // Realtime: mirror DB changes (inserts, updates, deletes) into local state
  // without refetching the whole list. RLS scopes the events to this user.
  const paletteCommands = useMemo(
    () => {
      const selected = sortedTasks[selectedIdx];
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
    [sortedTasks, selectedIdx, projectId],
  );
  useRegisterCommands(`tasks:${projectId}`, paletteCommands);

  // Realtime payloads carry the raw tasks row, not the enriched view (no
  // subtask aggregates / assignees). Inserts trigger a refetch so the new
  // row gets the same shape; updates patch in place because the visible
  // fields here are all on the row itself.
  type TaskRowRT = Partial<Task> & { id: string };
  useRealtimeTable<TaskRowRT>(
    {
      table: "tasks",
      filter: `terminal_id=eq.${projectId}`,
      channelKey: `tasks:${projectId}`,
    },
    {
      onInsert: () => void load(),
      onUpdate: (row) =>
        setTasks((prev) =>
          prev.map((t) => (t.id === row.id ? { ...t, ...row } : t)),
        ),
      onDelete: (row) =>
        setTasks((prev) => prev.filter((t) => t.id !== row.id)),
    },
  );

  useEffect(() => {
    if (creating) createRef.current?.focus();
  }, [creating]);

  // Keyboard shortcuts (scoped — only fire when focus isn't in an input)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      if (e.key === "j" || (e.shiftKey && e.key === "J")) {
        e.preventDefault();
        const next = Math.min(
          selectedIdx + 1,
          Math.max(sortedTasks.length - 1, 0),
        );
        setSelectedIdx(next);
        if (e.shiftKey) extendSelection(next);
      } else if (e.key === "k" || (e.shiftKey && e.key === "K")) {
        e.preventDefault();
        const next = Math.max(selectedIdx - 1, 0);
        setSelectedIdx(next);
        if (e.shiftKey) extendSelection(next);
      } else if (e.key === "x" && !e.metaKey && !e.ctrlKey) {
        const t = sortedTasks[selectedIdx];
        if (t) {
          e.preventDefault();
          toggleSelect(t.id);
        }
      } else if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setCreating(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        const t = sortedTasks[selectedIdx];
        if (t && t.status !== "done") void toggleComplete(t);
      } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        const t = sortedTasks[selectedIdx];
        if (t) {
          e.preventDefault();
          void toggleComplete(t);
        }
      } else if (e.key === ";") {
        // Open the comment thread on the selected task.
        const t = sortedTasks[selectedIdx];
        if (t) {
          e.preventDefault();
          setCommentTaskId((prev) => (prev === t.id ? null : t.id));
        }
      } else if (e.key === "Escape" && selectedIds.size > 0) {
        e.preventDefault();
        setSelectedIds(new Set());
        setAnchorId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedTasks, selectedIdx, selectedIds, anchorId]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchorId(id);
  }

  function extendSelection(toIdx: number) {
    const anchorIdx = anchorId
      ? sortedTasks.findIndex((t) => t.id === anchorId)
      : -1;
    if (anchorIdx === -1) {
      const t = sortedTasks[toIdx];
      if (t) {
        setSelectedIds(new Set([t.id]));
        setAnchorId(t.id);
      }
      return;
    }
    const [lo, hi] =
      anchorIdx < toIdx ? [anchorIdx, toIdx] : [toIdx, anchorIdx];
    const ids = sortedTasks.slice(lo, hi + 1).map((t) => t.id);
    setSelectedIds(new Set(ids));
  }

  /**
   * Click handlers mirror file-explorer norms:
   *   plain click       → single select, clear any active multi-select
   *   ctrl/cmd+click    → toggle one row in/out of the multi-selection
   *   shift+click       → contiguous range from anchor to clicked row
   */
  function rowClick(e: React.MouseEvent, idx: number, t: Task) {
    if (e.shiftKey) {
      e.preventDefault();
      setSelectedIdx(idx);
      extendSelection(idx);
    } else if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      toggleSelect(t.id);
      setSelectedIdx(idx);
    } else {
      setSelectedIdx(idx);
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        setAnchorId(null);
      }
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
      const r = await fetch(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
        credentials: "include",
      });
      if (!r.ok) await load(); // rollback by refetch
    } catch {
      await load();
    }
  }

  async function createTask(e?: React.FormEvent) {
    e?.preventDefault();
    if (!draftTitle.trim() || submitting) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/v1/projects/${ticker}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle.trim() }),
        credentials: "include",
      });
      if (!r.ok) {
        const body = (await r.json()) as { errors?: { message: string }[] };
        setError(body.errors?.[0]?.message ?? "Failed to create");
        return;
      }
      setDraftTitle("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  function cancelCreate() {
    setCreating(false);
    setDraftTitle("");
  }

  /**
   * Drag-drop reorder. Only invoked when sortKey === "manual".
   *
   * Midpoint trick: the new position is (prev.position + next.position) / 2.
   * For the head/tail pick neighbour ±1000 so we have headroom either way.
   * If positions get too tight to pick a clean midpoint we just bump out by
   * 1; the next reorder picks up where it can. We don't try to globally
   * re-space — it's cheap to do nothing here and let the sparse INT keep
   * absorbing midpoints for thousands of moves.
   */
  async function reorderTo(taskId: string, dropTargetId: string) {
    if (taskId === dropTargetId) return;
    const ordered = sortedTasks;
    const moving = tasks.find((t) => t.id === taskId);
    if (!moving) return;
    const filtered = ordered.filter((t) => t.id !== taskId);
    const newIdx = filtered.findIndex((t) => t.id === dropTargetId);
    if (newIdx < 0) return;
    const prev = filtered[newIdx - 1];
    const next = filtered[newIdx];
    const prevPos = prev?.position ?? null;
    const nextPos = next?.position ?? null;

    let newPos: number;
    if (prevPos != null && nextPos != null) {
      newPos = Math.floor((prevPos + nextPos) / 2);
      if (newPos === prevPos || newPos === nextPos) newPos = prevPos + 1;
    } else if (prevPos != null) {
      newPos = prevPos + 1000;
    } else if (nextPos != null) {
      newPos = nextPos - 1000;
    } else {
      newPos = 1000;
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, position: newPos } : t)),
    );
    try {
      const r = await fetch(`/api/v1/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ position: newPos }),
      });
      if (!r.ok) await load();
    } catch {
      await load();
    }
  }

  async function bulk(
    action:
      | { type: "status"; status: TaskStatus }
      | { type: "priority"; priority: number }
      | { type: "delete" }
      | { type: "assign"; user_id: string; replace: boolean },
  ) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    let payload:
      | { action: "status"; status: TaskStatus; task_ids: string[] }
      | { action: "priority"; priority: number; task_ids: string[] }
      | { action: "delete"; task_ids: string[] }
      | {
          action: "assign";
          user_ids: string[];
          replace: boolean;
          task_ids: string[];
        };
    switch (action.type) {
      case "status":
        payload = { action: "status", status: action.status, task_ids: ids };
        break;
      case "priority":
        payload = {
          action: "priority",
          priority: action.priority,
          task_ids: ids,
        };
        break;
      case "delete":
        payload = { action: "delete", task_ids: ids };
        break;
      case "assign":
        payload = {
          action: "assign",
          user_ids: [action.user_id],
          replace: action.replace,
          task_ids: ids,
        };
        break;
    }
    try {
      const r = await fetch(`/api/v1/tasks/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const body = (await r.json()) as { errors?: { message: string }[] };
        setError(body.errors?.[0]?.message ?? "Bulk action failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSelectedIds(new Set());
      setAnchorId(null);
      await load();
    }
  }

  const commentTask = sortedTasks.find((t) => t.id === commentTaskId) ?? null;

  function pickSort(next: TaskSortKey) {
    setSortKey(next);
    saveTaskSort(next);
    setSortMenuOpen(false);
  }

  return (
    <div className="flex h-full">
      <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-text-0">Tasks</h2>
          <span className="font-mono text-xs text-text-3">{tasks.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <SortMenu
            open={sortMenuOpen}
            onOpenChange={setSortMenuOpen}
            value={sortKey}
            onChange={pickSort}
          />
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-2 hover:bg-bg-2 hover:text-text-0"
          >
            <Plus className="h-3 w-3" /> New task{" "}
            <kbd className="ml-1 font-mono text-[10px] text-text-3">C</kbd>
          </button>
        </div>
      </div>

      {error ? (
        <div className="border-b border-border bg-danger-subtle px-4 py-2 text-xs text-danger">
          {error}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonList />
        ) : sortedTasks.length === 0 && !creating ? (
          <Empty onCreate={() => setCreating(true)} />
        ) : (
          <ul className="divide-y divide-border">
            {sortedTasks.map((t, i) => (
              <TaskRow
                key={t.id}
                task={t}
                ticker={ticker}
                selected={i === selectedIdx}
                multiSelected={selectedIds.has(t.id)}
                showDragHandle={sortKey === "manual"}
                isDragOver={dragOverId === t.id}
                onRowClick={(e) => rowClick(e, i, t)}
                onToggle={() => toggleComplete(t)}
                onOpenComments={() =>
                  setCommentTaskId((prev) =>
                    prev === t.id ? null : t.id,
                  )
                }
                onDragStart={() => setDraggingId(t.id)}
                onDragOver={(e) => {
                  if (!draggingId || draggingId === t.id) return;
                  e.preventDefault();
                  setDragOverId(t.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === t.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggingId && draggingId !== t.id) {
                    void reorderTo(draggingId, t.id);
                  }
                  setDraggingId(null);
                  setDragOverId(null);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                }}
              />
            ))}
          </ul>
        )}

        {creating ? (
          <form onSubmit={createTask} className="flex items-center gap-3 border-t border-border bg-bg-1 px-4 py-2.5">
            <Circle className="h-3.5 w-3.5 flex-shrink-0 text-text-3" aria-hidden="true" />
            <input
              ref={createRef}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelCreate();
                }
              }}
              placeholder="New task… Enter to save, Esc to cancel"
              aria-label="New task title"
              className="flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
              disabled={submitting}
            />
            <button
              type="button"
              onClick={cancelCreate}
              className="text-xs text-text-3 hover:text-text-1"
            >
              Esc
            </button>
          </form>
        ) : null}
      </div>

      {selectedIds.size > 0 ? (
        <BulkActionBar
          count={selectedIds.size}
          members={mentionables}
          onClear={() => {
            setSelectedIds(new Set());
            setAnchorId(null);
          }}
          onMarkDone={() => bulk({ type: "status", status: "done" })}
          onSetPriority={(p) => bulk({ type: "priority", priority: p })}
          onReassign={(uid, replace) =>
            bulk({ type: "assign", user_id: uid, replace })
          }
          onDelete={() => bulk({ type: "delete" })}
        />
      ) : null}
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
  multiSelected,
  showDragHandle,
  isDragOver,
  onRowClick,
  onToggle,
  onOpenComments,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  task: Task;
  ticker: string;
  selected: boolean;
  multiSelected: boolean;
  showDragHandle: boolean;
  isDragOver: boolean;
  onRowClick: (e: React.MouseEvent) => void;
  onToggle: () => void;
  onOpenComments: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const done = task.status === "done";

  return (
    <li
      onClick={onRowClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "group flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors",
        selected ? "bg-bg-2" : "hover:bg-bg-2",
        multiSelected && "bg-accent/10",
        selected &&
          !multiSelected &&
          "border-l-2 border-l-border-focus pl-[10px]",
        isDragOver && "border-t-2 border-t-accent",
      )}
    >
      {showDragHandle ? (
        <button
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", task.id);
            e.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to reorder"
          className="cursor-grab text-text-3 opacity-0 transition-opacity hover:text-text-0 group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
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
      {task.subtask_total > 0 ? (
        <span
          className="flex flex-shrink-0 items-center gap-1 font-mono text-[10px] text-text-3"
          title={`${task.subtask_done} of ${task.subtask_total} subtasks done`}
        >
          <ListChecks className="h-3 w-3" aria-hidden="true" />
          {task.subtask_done}/{task.subtask_total}
        </span>
      ) : null}
      {task.assignees[0] ? (
        <span
          className="flex flex-shrink-0 items-center gap-1 text-[10px] text-text-3"
          title={
            task.assignees.length === 1
              ? (task.assignees[0]!.full_name ?? "someone")
              : `${task.assignees[0]!.full_name ?? "someone"} +${
                  task.assignees.length - 1
                }`
          }
        >
          <Avatar name={task.assignees[0]!.full_name} size="xs" />
          {task.assignees.length > 1 ? (
            <span className="font-mono">+{task.assignees.length - 1}</span>
          ) : null}
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
    </li>
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
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <p className="text-sm text-text-2">No tasks yet.</p>
      <button
        onClick={onCreate}
        className="rounded border border-border bg-bg-2 px-3 py-1.5 text-sm text-text-1 hover:bg-bg-3"
      >
        Create first task
      </button>
      <p className="font-mono text-xs text-text-3">or press C</p>
    </div>
  );
}

function SortMenu({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  value: TaskSortKey;
  onChange: (next: TaskSortKey) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        onOpenChange(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => onOpenChange(!open)}
        className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-2 hover:bg-bg-2 hover:text-text-0"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ArrowDownUp className="h-3 w-3" />
        <span className="hidden sm:inline">Sort:</span>
        <span>{TASK_SORT_LABELS[value]}</span>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-48 rounded border border-border bg-bg-1 py-1 shadow-lg"
        >
          {TASK_SORT_KEYS.map((k) => (
            <button
              key={k}
              role="menuitemradio"
              aria-checked={value === k}
              onClick={() => onChange(k)}
              className={cn(
                "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-bg-2",
                value === k ? "text-text-0" : "text-text-2",
              )}
            >
              <span>{TASK_SORT_LABELS[k]}</span>
              {value === k ? (
                <Check className="h-3 w-3 text-accent" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BulkActionBar({
  count,
  members,
  onClear,
  onMarkDone,
  onSetPriority,
  onReassign,
  onDelete,
}: {
  count: number;
  members: Mentionable[];
  onClear: () => void;
  onMarkDone: () => void;
  onSetPriority: (p: number) => void;
  onReassign: (userId: string, replace: boolean) => void;
  onDelete: () => void;
}) {
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex items-center gap-2 border-t border-border bg-bg-1 px-3 py-2 text-xs">
      <span className="font-mono text-text-2">{count} selected</span>
      <button
        onClick={onClear}
        className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
        aria-label="Clear selection"
        title="Clear selection (Esc)"
      >
        <X className="h-3 w-3" />
      </button>
      <span className="ml-2 h-4 w-px bg-border" aria-hidden="true" />
      <button
        onClick={onMarkDone}
        className="flex items-center gap-1 rounded-sm px-2 py-1 text-text-2 hover:bg-bg-2 hover:text-text-0"
      >
        <Check className="h-3 w-3" /> Mark done
      </button>
      <div className="relative">
        <button
          onClick={() => {
            setPriorityOpen((s) => !s);
            setReassignOpen(false);
          }}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-text-2 hover:bg-bg-2 hover:text-text-0"
        >
          <Flag className="h-3 w-3" /> Priority
        </button>
        {priorityOpen ? (
          <div className="absolute bottom-full left-0 mb-1 w-32 rounded border border-border bg-bg-1 py-1 shadow-lg">
            {[
              { p: 1, label: "Urgent" },
              { p: 2, label: "High" },
              { p: 3, label: "Medium" },
              { p: 4, label: "Low" },
            ].map(({ p, label }) => (
              <button
                key={p}
                onClick={() => {
                  onSetPriority(p);
                  setPriorityOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-bg-2"
              >
                <PriorityDots priority={p} />
                <span className="text-text-1">{label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="relative">
        <button
          onClick={() => {
            setReassignOpen((s) => !s);
            setPriorityOpen(false);
          }}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-text-2 hover:bg-bg-2 hover:text-text-0"
        >
          <UserPlus className="h-3 w-3" /> Reassign
        </button>
        {reassignOpen ? (
          <div className="absolute bottom-full left-0 mb-1 max-h-56 w-56 overflow-y-auto rounded border border-border bg-bg-1 py-1 shadow-lg">
            {members.length === 0 ? (
              <span className="block px-3 py-1 text-text-3">No members.</span>
            ) : (
              members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between gap-2 px-3 py-1 hover:bg-bg-2"
                >
                  <span className="flex flex-1 items-center gap-2 truncate">
                    <Avatar name={m.full_name} size="xs" />
                    <span className="truncate text-text-1">
                      {m.full_name ?? "someone"}
                    </span>
                  </span>
                  <button
                    onClick={() => {
                      onReassign(m.user_id, false);
                      setReassignOpen(false);
                    }}
                    className="text-[10px] text-text-3 hover:text-text-0"
                    title="Add as assignee"
                  >
                    + add
                  </button>
                  <button
                    onClick={() => {
                      onReassign(m.user_id, true);
                      setReassignOpen(false);
                    }}
                    className="text-[10px] text-text-3 hover:text-accent"
                    title="Replace existing assignees"
                  >
                    set
                  </button>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
      <span className="ml-auto" />
      {confirmDelete ? (
        <div className="flex items-center gap-2">
          <span className="text-text-3">Delete {count}?</span>
          <button
            onClick={() => setConfirmDelete(false)}
            className="rounded-sm px-2 py-1 text-text-3 hover:text-text-1"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onDelete();
              setConfirmDelete(false);
            }}
            className="rounded-sm bg-danger px-2 py-1 text-bg-0 hover:opacity-90"
          >
            Confirm
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-danger hover:bg-danger-subtle"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      )}
    </div>
  );
}
