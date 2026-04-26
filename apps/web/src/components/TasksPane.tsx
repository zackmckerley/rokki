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

      if (e.key === "j") {
        e.preventDefault();
        setSelectedIdx((i) =>
          Math.min(i + 1, Math.max(sortedTasks.length - 1, 0)),
        );
      } else if (e.key === "k") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedTasks, selectedIdx]);

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
                onClick={() => setSelectedIdx(i)}
                onToggle={() => toggleComplete(t)}
                onOpenComments={() =>
                  setCommentTaskId((prev) => (prev === t.id ? null : t.id))
                }
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
  onClick,
  onToggle,
  onOpenComments,
}: {
  task: Task;
  ticker: string;
  selected: boolean;
  onClick: () => void;
  onToggle: () => void;
  onOpenComments: () => void;
}) {
  const done = task.status === "done";

  return (
    <li
      onClick={onClick}
      className={cn(
        "group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors",
        selected ? "bg-bg-2" : "hover:bg-bg-2",
        selected && "border-l-2 border-l-border-focus pl-[14px]",
      )}
    >
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
