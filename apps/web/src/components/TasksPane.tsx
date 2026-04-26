"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Check, Circle, MessageSquare, Maximize2, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { useRegisterCommands } from "@/lib/use-register-commands";
import { CommentThread } from "./CommentThread";
import { MergeTaskDialog } from "./MergeTaskDialog";
import { HelpTip } from "./HelpTip";
import {
  PriorityDots,
  StatusPill,
  DueChip,
} from "./primitives";
import {
  getDragPayload,
  hasDragKind,
  setDragPayload,
  subscribeActiveDragKind,
  type RokkiDragKind,
} from "@/lib/drag-drop";
import type { TaskStatus } from "@rokki/db";

interface Task {
  id: string;
  ticker_seq: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  due_date: string | null;
  labels: string[];
  created_at: string;
  completed_at: string | null;
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
  /** ID of the task being dragged within this pane (for merge). */
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  /** ID of the task currently underneath a drag (any kind). */
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  /** Pair queued for the merge dialog. Source is being dropped onto target. */
  const [mergePair, setMergePair] = useState<{
    source: { id: string; title: string };
    target: { id: string; title: string };
  } | null>(null);
  /** Toast text shown briefly after a drop succeeds. */
  const [dropToast, setDropToast] = useState<string | null>(null);
  const createRef = useRef<HTMLInputElement>(null);

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
          prev.some((t) => t.id === row.id) ? prev : sortTasks([row, ...prev]),
        ),
      onUpdate: (row) =>
        setTasks((prev) =>
          sortTasks(prev.map((t) => (t.id === row.id ? { ...t, ...row } : t))),
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

  /** Show a transient toast above the task list. */
  const flashToast = useCallback((msg: string) => {
    setDropToast(msg);
    window.setTimeout(() => setDropToast(null), 2200);
  }, []);

  /**
   * Attach a file (already uploaded into this terminal) to a task. Posts
   * to /api/v1/tasks/:id/files; does NOT optimistically mutate task state
   * — the visible task row doesn't display attachments yet, so the toast
   * is the only feedback path.
   */
  const attachFileToTask = useCallback(
    async (taskId: string, fileId: string, taskTitle: string) => {
      try {
        const r = await fetch(`/api/v1/tasks/${taskId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_id: fileId }),
          credentials: "include",
        });
        if (!r.ok && r.status !== 204) {
          const body = (await r.json().catch(() => ({}))) as {
            errors?: { message: string }[];
          };
          setError(body.errors?.[0]?.message ?? "Could not attach file");
          return;
        }
        flashToast(`Attached file to ${taskTitle}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      }
    },
    [flashToast],
  );

  /**
   * Assign a member (dragged from TeamPane) to a task. POST is idempotent
   * — the API returns 204 even if the user is already an assignee.
   */
  const assignUserToTask = useCallback(
    async (taskId: string, userId: string, taskTitle: string) => {
      try {
        const r = await fetch(`/api/v1/tasks/${taskId}/assignees`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
          credentials: "include",
        });
        if (!r.ok && r.status !== 204) {
          const body = (await r.json().catch(() => ({}))) as {
            errors?: { message: string }[];
          };
          setError(body.errors?.[0]?.message ?? "Could not assign");
          return;
        }
        const assignee =
          mentionables.find((m) => m.user_id === userId)?.full_name ?? "user";
        flashToast(`Assigned ${assignee} to ${taskTitle}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      }
    },
    [flashToast, mentionables],
  );

  /**
   * Resolve a drop on a task row. Sniffs the dataTransfer for our MIME
   * types in priority order: file > user > task. The task case opens
   * the merge dialog; file and user POST directly.
   */
  const handleTaskRowDrop = useCallback(
    (target: Task, dt: DataTransfer) => {
      // 1. file → attach
      const fileId = getDragPayload(dt, "file");
      if (fileId) {
        void attachFileToTask(target.id, fileId, target.title);
        return;
      }
      // 2. user → assign
      const userId = getDragPayload(dt, "user");
      if (userId) {
        void assignUserToTask(target.id, userId, target.title);
        return;
      }
      // 3. task → merge dialog (skip self-drops)
      const sourceId = getDragPayload(dt, "task");
      if (sourceId && sourceId !== target.id) {
        const source = tasks.find((t) => t.id === sourceId);
        if (source) {
          setMergePair({
            source: { id: source.id, title: source.title },
            target: { id: target.id, title: target.title },
          });
        }
      }
    },
    [attachFileToTask, assignUserToTask, tasks],
  );

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

  const commentTask = tasks.find((t) => t.id === commentTaskId) ?? null;

  return (
    <div className="flex h-full">
      <div className="relative flex h-full flex-1 flex-col">
      {dropToast ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-2 z-20 mx-auto w-fit rounded-sm border border-accent/40 bg-accent-subtle px-3 py-1 text-xs font-medium text-accent shadow-sm"
          role="status"
          aria-live="polite"
        >
          {dropToast}
        </div>
      ) : null}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <HelpTip term="task-attach-files">
            <h2 className="text-sm font-semibold text-text-0">Tasks</h2>
          </HelpTip>
          <span className="font-mono text-xs text-text-3">{tasks.length}</span>
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
            {tasks.map((t, i) => (
              <TaskRow
                key={t.id}
                task={t}
                ticker={ticker}
                selected={i === selectedIdx}
                isDragging={draggingTaskId === t.id}
                isDropTarget={hoveredTaskId === t.id && draggingTaskId !== t.id}
                onClick={() => setSelectedIdx(i)}
                onToggle={() => toggleComplete(t)}
                onOpenComments={() =>
                  setCommentTaskId((prev) => (prev === t.id ? null : t.id))
                }
                onDragStartTask={() => setDraggingTaskId(t.id)}
                onDragEndTask={() => {
                  setDraggingTaskId(null);
                  setHoveredTaskId(null);
                }}
                onDragEnterRow={() => setHoveredTaskId(t.id)}
                onDragLeaveRow={() => {
                  setHoveredTaskId((prev) => (prev === t.id ? null : prev));
                }}
                onDropOnRow={(dt) => {
                  setHoveredTaskId(null);
                  handleTaskRowDrop(t, dt);
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
      {mergePair ? (
        <MergeTaskDialog
          open={Boolean(mergePair)}
          onClose={() => setMergePair(null)}
          source={mergePair.source}
          target={mergePair.target}
          onMerged={(targetId) => {
            const targetTitle =
              tasks.find((t) => t.id === targetId)?.title ?? "task";
            flashToast(`Merged into ${targetTitle}`);
            setMergePair(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  ticker,
  selected,
  isDragging,
  isDropTarget,
  onClick,
  onToggle,
  onOpenComments,
  onDragStartTask,
  onDragEndTask,
  onDragEnterRow,
  onDragLeaveRow,
  onDropOnRow,
}: {
  task: Task;
  ticker: string;
  selected: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onClick: () => void;
  onToggle: () => void;
  onOpenComments: () => void;
  onDragStartTask: () => void;
  onDragEndTask: () => void;
  onDragEnterRow: () => void;
  onDragLeaveRow: () => void;
  onDropOnRow: (dt: DataTransfer) => void;
}) {
  const done = task.status === "done";

  // Caption shown above the drop ring while a drag is over this row,
  // chosen by sniffing which kind we're carrying. dragenter doesn't expose
  // payload values (browser security model), but `types` is available.
  const dropCaption = useDropCaption(isDropTarget);

  return (
    <li
      draggable
      onDragStart={(e) => {
        setDragPayload(e.dataTransfer, "task", task.id, task.title);
        onDragStartTask();
      }}
      onDragEnd={onDragEndTask}
      onDragEnter={(e) => {
        if (
          hasDragKind(e.dataTransfer, "file") ||
          hasDragKind(e.dataTransfer, "user") ||
          hasDragKind(e.dataTransfer, "task")
        ) {
          e.preventDefault();
          onDragEnterRow();
        }
      }}
      onDragOver={(e) => {
        if (
          hasDragKind(e.dataTransfer, "file") ||
          hasDragKind(e.dataTransfer, "user") ||
          hasDragKind(e.dataTransfer, "task")
        ) {
          e.preventDefault();
          e.dataTransfer.dropEffect = hasDragKind(e.dataTransfer, "user")
            ? "link"
            : "move";
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) onDragLeaveRow();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropOnRow(e.dataTransfer);
      }}
      onClick={onClick}
      className={cn(
        "group relative flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors",
        selected ? "bg-bg-2" : "hover:bg-bg-2",
        selected && "border-l-2 border-l-border-focus pl-[14px]",
        isDragging && "opacity-50",
        isDropTarget &&
          "ring-1 ring-inset ring-warning/70 bg-warning-subtle/40",
      )}
    >
      {dropCaption ? (
        <span
          className="pointer-events-none absolute -top-2 left-3 z-10 rounded-sm border border-warning/40 bg-bg-1 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-warning"
          aria-hidden="true"
        >
          {dropCaption}
        </span>
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
 * Pull the active drag kind from the global tracker and translate it to
 * a tiny caption shown above a hovered task row. Returns null when no
 * drag is in flight or when the row isn't actually a drop target.
 */
function useDropCaption(active: boolean): string | null {
  const [kind, setKind] = useState<RokkiDragKind | null>(null);
  useEffect(() => subscribeActiveDragKind(setKind), []);
  if (!active || !kind) return null;
  switch (kind) {
    case "file":
      return "Attach file to task";
    case "user":
      return "Assign member";
    case "task":
      return "Merge into this task";
  }
}

/**
 * Stable sort mirroring the server's ORDER BY (status → priority → due →
 * created). Realtime inserts can arrive in any order; sorting client-side
 * keeps the visible list stable.
 */
function sortTasks(tasks: Task[]): Task[] {
  const rank: Record<TaskStatus, number> = {
    todo: 0,
    in_progress: 1,
    review: 2,
    blocked: 3,
    done: 4,
  };
  return [...tasks].sort((a, b) => {
    const s = rank[a.status] - rank[b.status];
    if (s !== 0) return s;
    const p = a.priority - b.priority;
    if (p !== 0) return p;
    const da = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
    const db = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

