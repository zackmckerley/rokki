"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Check, MessageSquare, ListTodo } from "lucide-react";
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
import { TaskSectionHeader, groupTone } from "./TaskSectionHeader";
import { TaskListToolbar, type GroupOption } from "./TaskListToolbar";
import { TaskRow } from "./TaskRow";
import { groupTasks, type TaskGroupMode } from "@/lib/task-grouping";

/** Group-by options for the in-terminal pane (no "Terminal" — you're
 * already inside one). Shared toolbar renders these in the dropdown. */
const TERMINAL_GROUP_OPTIONS: GroupOption[] = [
  { value: "none", label: "None" },
  { value: "due", label: "Due" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
];
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
  /**
   * "Highest priority of the day" flag. Starred tasks sort to the
   * top of the list regardless of priority/due/position. Toggled
   * inline from the star button on each row.
   */
  starred: boolean;
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
  // `_v2` bump: the default group-by changed from "none" to "due" so the
  // sectioned view (sticky headers, counts, collapse) is what you see
  // out of the box. The old `_v1`-era key had "none" persisted for
  // existing users, which would have suppressed the new default — the
  // version bump retires those saved values so everyone picks up the
  // grouped default once, then their own choice persists under v2.
  return `rokki_tasks_group_v2:${projectId}`;
}

function hideDoneStorageKey(projectId: string): string {
  return `rokki_tasks_hide_done:${projectId}`;
}

function collapsedGroupsStorageKey(projectId: string): string {
  return `rokki_tasks_collapsed_groups:${projectId}`;
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
  // Default to grouping by due date so the task list opens in the
  // sectioned view (Overdue / Today / This week / Later / Done) with
  // the sticky colored headers — the look approved in the #14 mockup —
  // instead of a flat undifferentiated list. Users can switch to
  // "None" (which also re-enables manual drag-reorder) and the choice
  // persists per terminal.
  const [groupMode, setGroupMode] = useState<GroupMode>("due");
  /**
   * When true, completed tasks are filtered out of the view. The
   * server still returns them so the count of hidden rows can be
   * displayed (so you remember they exist) and toggling back is
   * instant — no refetch needed. Persisted per-terminal so each
   * project remembers its own preference.
   */
  const [hideDone, setHideDone] = useState(false);
  /**
   * Collapsed group keys, stored as `${groupMode}:${groupKey}` so a
   * collapse in one group-by mode doesn't bleed into another. Persisted
   * per-terminal. Lets the user fold away "Done"/"Later" to focus.
   */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
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

  // Hydrate + persist the hide-done preference per project.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(hideDoneStorageKey(projectId));
      if (saved === "1") setHideDone(true);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        hideDoneStorageKey(projectId),
        hideDone ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [projectId, hideDone]);

  // Hydrate + persist collapsed-group state per project.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(
        collapsedGroupsStorageKey(projectId),
      );
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
  }, [projectId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        collapsedGroupsStorageKey(projectId),
        JSON.stringify([...collapsedGroups]),
      );
    } catch {
      /* ignore */
    }
  }, [projectId, collapsedGroups]);

  const toggleGroupCollapsed = useCallback((collapseKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(collapseKey)) next.delete(collapseKey);
      else next.add(collapseKey);
      return next;
    });
  }, []);

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

  // Cancel any in-flight `load()` when a new one starts. Without this,
  // toggling Auto ↔ Manual rapidly leaves two requests racing — the
  // slower one's response would overwrite the faster (newer) one,
  // dropping tasks that arrived via realtime in between and sometimes
  // landing the wrong sort. The aborted fetch throws an AbortError
  // which the catch block silently swallows.
  const loadAbortRef = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    // Abort any prior in-flight fetch before starting a new one so its
    // response can't race past us and clobber state.
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

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
        signal: controller.signal,
      });
      // Bail if this fetch is no longer the latest one — the response
      // body is already in flight when abort() fires, so the AbortError
      // may or may not throw before we get here. Belt-and-suspenders.
      if (controller.signal.aborted) return;
      const body = (await r.json()) as {
        data?: Task[];
        errors?: { message: string }[];
      };
      if (controller.signal.aborted) return;
      if (!r.ok) {
        setError(body.errors?.[0]?.message ?? "Failed to load tasks");
        return;
      }
      setTasks(body.data ?? []);
      setError(null);
    } catch (e) {
      // Aborted by a newer load() — silent.
      if (e instanceof DOMException && e.name === "AbortError") return;
      // Some browsers wrap network/abort errors in TypeError before
      // throwing — same intent, swallow.
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      // Only the latest controller's request flips loading back off.
      // An older aborted request leaving loading=false here would race
      // a newer request that just set loading=true.
      if (loadAbortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [ticker, sortMode]);

  // Abort whatever's in flight when the component unmounts so we don't
  // try to setState on a dead component (and don't leak request handles).
  useEffect(() => {
    return () => {
      loadAbortRef.current?.abort();
    };
  }, []);

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

  /**
   * Toggle the star on a task. Optimistically flips the flag locally
   * (so the row jumps to/from the top immediately) and PATCHes the
   * server. Rollback on failure via load().
   */
  async function toggleStar(task: Task) {
    const next = !task.starred;
    setTasks((prev) =>
      sortTasks(
        prev.map((t) => (t.id === task.id ? { ...t, starred: next } : t)),
        sortMode,
      ),
    );
    try {
      const r = await offlineFetch(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred: next }),
        label: next ? `Star "${task.title}"` : `Unstar "${task.title}"`,
      });
      if (!r.ok && r.status !== 202) await load();
    } catch {
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
   * translate it into the API's body shape, optimistically insert
   * the returned row into local state, and let realtime reconcile.
   *
   * Why optimistic + no follow-up `load()`:
   *   - Before this, the flow was POST → await load(). A slow refetch,
   *     a transient realtime hiccup, or a brief replication lag could
   *     each cause the freshly-created task to not appear until the
   *     user manually refreshed.
   *   - The POST response now returns the same shape as the GET list
   *     (matching column set + assignees + subtask aggregates), so
   *     dropping it straight into state gives the user instant feedback.
   *   - The realtime channel still fires onInsert and deduplicates by
   *     id (see `onInsert` above), so a slow round-trip + a fast
   *     realtime push doesn't double-insert.
   *
   * Throws on failure so the composer can surface the error inline.
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
    if (r.status === 202) {
      // Offline-queued — there's no real row yet. Background drain
      // will fire the realtime push when connectivity returns.
      return;
    }
    // Parse the server's freshly-inserted row and slot it into state
    // immediately. dedupe in case the realtime channel raced us.
    try {
      const body = (await r.json()) as { data?: Task };
      const created = body.data;
      if (created && created.id) {
        setTasks((prev) =>
          prev.some((t) => t.id === created.id)
            ? prev
            : sortTasks([created, ...prev], sortMode),
        );
      } else {
        // Fall back to a refetch if the server didn't return what we
        // expected — shouldn't happen on the current API but guards
        // against a future shape regression silently breaking creates.
        await load();
      }
    } catch {
      await load();
    }
  }

  function cancelCreate() {
    setCreating(false);
  }

  const commentTask = tasks.find((t) => t.id === commentTaskId) ?? null;

  return (
    <div className="flex h-full">
      <div className="flex h-full flex-1 flex-col">
      <TaskListToolbar
        count={tasks.length}
        sortMode={sortMode}
        onSortMode={setSortMode}
        groupMode={groupMode}
        onGroupMode={(m) => setGroupMode(m as GroupMode)}
        groupOptions={TERMINAL_GROUP_OPTIONS}
        hideDone={hideDone}
        onHideDone={() => setHideDone((v) => !v)}
        doneCount={tasks.filter((t) => t.status === "done").length}
        query={query}
        onQuery={setQuery}
        onNewTask={() => setCreating(true)}
      />

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
            // Hide-done step runs before the search filter so the "X
            // tasks match" count reflects only what's visible.
            const visibleSource = hideDone
              ? tasks.filter((t) => t.status !== "done")
              : tasks;
            const filtered = filterTasks(visibleSource, query, ticker);
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
              <div className="divide-y-2 divide-border-strong">
                {groups.map((group) => {
                  const hasHeader = group.label !== "";
                  const collapseKey = `${groupMode}:${group.key}`;
                  const collapsed =
                    hasHeader && collapsedGroups.has(collapseKey);
                  const tone = groupTone(groupMode, group.key);
                  return (
                  <section key={group.key}>
                    {hasHeader ? (
                      <TaskSectionHeader
                        label={group.label}
                        count={group.tasks.length}
                        tone={tone}
                        collapsed={collapsed}
                        onToggle={() => toggleGroupCollapsed(collapseKey)}
                      />
                    ) : null}
                    {!collapsed ? (
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
                              onToggleStar={() => toggleStar(t)}
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
                    ) : null}
                  </section>
                  );
                })}
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
  // Starred tasks float to the top of every sort mode — that's the
  // contract of the star ("highest priority of the day"). Matches the
  // server-side `ORDER BY starred DESC, …` so realtime + load() agree.
  const starRank = (t: Task) => (t.starred ? 0 : 1);

  if (mode === "manual") {
    return [...tasks].sort((a, b) => {
      const s = starRank(a) - starRank(b);
      if (s !== 0) return s;
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
    const s = starRank(a) - starRank(b);
    if (s !== 0) return s;
    const st = rank[a.status] - rank[b.status];
    if (st !== 0) return st;
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

