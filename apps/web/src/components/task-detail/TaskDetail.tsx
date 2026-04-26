"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  Plus,
  Trash2,
  Link as LinkIcon,
  GitBranch,
  Tag as TagIcon,
  Edit3,
  MessageSquare,
  Eye,
  ListChecks,
  Repeat,
  GripVertical,
} from "lucide-react";
import type { TaskRecurrenceRule } from "@rokki/db";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";
import { CommentThread } from "@/components/CommentThread";
import { HistoryTimeline, type HistoryRow } from "@/components/HistoryTimeline";
import {
  PriorityDots,
  StatusPill,
  DueChip,
  Avatar,
  TickerChip,
} from "@/components/primitives";
import { useRealtimeTable } from "@/lib/supabase/realtime";

type TaskStatus = "todo" | "in_progress" | "blocked" | "review" | "done";

interface Task {
  id: string;
  ticker_seq: number;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  due_date: string | null;
  labels: string[] | null;
  recurrence_rule?: TaskRecurrenceRule | null;
  recurrence_parent_id?: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  created_by: string;
}

interface Subtask {
  id: string;
  label: string;
  done: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

interface Watcher {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  added_at: string;
}

interface Member {
  user_id: string;
  role: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Sibling {
  id: string;
  ticker_seq: number;
  title: string;
  status: string;
}

interface Assignee {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  assigned_at: string;
}

interface RelatedTask {
  id: string;
  ticker_seq: number;
  title: string;
  status: string;
}

interface Activity {
  id: string;
  action: string;
  actor_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  before_json?: unknown;
  after_json?: unknown;
}

interface Bundle {
  task: Task;
  assignees: Assignee[];
  watchers: Watcher[];
  subtasks: Subtask[];
  depends_on: RelatedTask[];
  blocks: RelatedTask[];
  activity: Activity[];
  creator: { user_id: string; full_name: string | null };
}

interface TaskDetailProps {
  initialTask: Task;
  terminal: { id: string; ticker: string; name: string };
  members: Member[];
  siblings: Sibling[];
  currentUserId: string;
}

const STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
];

/**
 * The task detail surface.
 *
 * Layout (≥md):
 *   ┌─ main ──────────────────────────┐  ┌─ aside ──┐
 *   │ title                            │  │ status  │
 *   │ description (md editor/render)   │  │ prio    │
 *   │ dependencies · blocks            │  │ due     │
 *   │ labels                           │  │ assignees│
 *   │ history timeline                 │  │ creator │
 *   └──────────────────────────────────┘  └──────────┘
 *   ┌─ comments thread (full width) ────────────────┐
 *
 * On mobile the aside stacks under main. Every mutation is optimistic with
 * a refetch fallback on error; Realtime updates are reconciled passively so
 * collaborators' edits appear without reloading.
 */
export function TaskDetail({
  initialTask,
  terminal,
  members,
  siblings,
  currentUserId,
}: TaskDetailProps) {
  const router = useRouter();
  const [task, setTask] = useState<Task>(initialTask);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loadingBundle, setLoadingBundle] = useState(true);
  const [editingDescription, setEditingDescription] = useState(false);
  const [draftDescription, setDraftDescription] = useState(
    initialTask.description ?? "",
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(initialTask.title);

  const loadBundle = useCallback(async () => {
    setLoadingBundle(true);
    try {
      const r = await fetch(
        `/api/v1/tasks/by-seq/${terminal.ticker}/${task.ticker_seq}`,
        { credentials: "include" },
      );
      if (!r.ok) return;
      const body = (await r.json()) as { data: Bundle };
      setBundle(body.data);
      setTask(body.data.task);
    } finally {
      setLoadingBundle(false);
    }
  }, [terminal.ticker, task.ticker_seq]);
  useEffect(() => {
    void loadBundle();
  }, [loadBundle]);

  // Realtime: anything that touches this task, or its assignees/deps, reloads.
  useRealtimeTable<{ id: string }>(
    { table: "tasks", filter: `id=eq.${task.id}`, channelKey: `task:${task.id}` },
    { onUpdate: () => void loadBundle(), onDelete: () => router.push(`/p/${terminal.ticker}`) },
  );
  useRealtimeTable<{ task_id: string }>(
    {
      table: "task_assignees",
      filter: `task_id=eq.${task.id}`,
      channelKey: `task-assignees:${task.id}`,
    },
    { onInsert: () => void loadBundle(), onDelete: () => void loadBundle() },
  );
  useRealtimeTable<{ task_id: string }>(
    {
      table: "task_dependencies",
      filter: `task_id=eq.${task.id}`,
      channelKey: `task-deps:${task.id}`,
    },
    { onInsert: () => void loadBundle(), onDelete: () => void loadBundle() },
  );
  useRealtimeTable<{ task_id: string }>(
    {
      table: "subtasks",
      filter: `task_id=eq.${task.id}`,
      channelKey: `task-subtasks:${task.id}`,
    },
    {
      onInsert: () => void loadBundle(),
      onUpdate: () => void loadBundle(),
      onDelete: () => void loadBundle(),
    },
  );
  useRealtimeTable<{ task_id: string }>(
    {
      table: "task_watchers",
      filter: `task_id=eq.${task.id}`,
      channelKey: `task-watchers:${task.id}`,
    },
    { onInsert: () => void loadBundle(), onDelete: () => void loadBundle() },
  );

  async function patchTask(patch: Partial<Task>) {
    setTask((t) => ({ ...t, ...patch }));
    const r = await fetch(`/api/v1/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(patch),
    });
    if (!r.ok) await loadBundle();
  }

  async function saveTitle() {
    const next = draftTitle.trim();
    if (!next) return;
    setEditingTitle(false);
    if (next !== task.title) await patchTask({ title: next });
  }

  async function saveDescription() {
    setEditingDescription(false);
    if (draftDescription !== (task.description ?? ""))
      await patchTask({ description: draftDescription });
  }

  async function toggleStatus() {
    const next: TaskStatus = task.status === "done" ? "todo" : "done";
    await patchTask({
      status: next,
      completed_at: next === "done" ? new Date().toISOString() : null,
    });
  }

  async function addAssignee(userId: string) {
    await fetch(`/api/v1/tasks/${task.id}/assignees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id: userId }),
    });
    await loadBundle();
  }

  async function removeAssignee(userId: string) {
    await fetch(
      `/api/v1/tasks/${task.id}/assignees?user_id=${encodeURIComponent(userId)}`,
      { method: "DELETE", credentials: "include" },
    );
    await loadBundle();
  }

  async function addDependency(dependsOn: string) {
    await fetch(`/api/v1/tasks/${task.id}/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ depends_on: dependsOn }),
    });
    await loadBundle();
  }

  async function removeDependency(dependsOn: string) {
    await fetch(
      `/api/v1/tasks/${task.id}/dependencies?depends_on=${encodeURIComponent(dependsOn)}`,
      { method: "DELETE", credentials: "include" },
    );
    await loadBundle();
  }

  async function setLabels(next: string[]) {
    await patchTask({ labels: next });
  }

  async function addSubtask(label: string) {
    if (!label.trim()) return;
    await fetch(`/api/v1/tasks/${task.id}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ label }),
    });
    await loadBundle();
  }

  async function patchSubtask(
    subtaskId: string,
    patch: Partial<Pick<Subtask, "label" | "done" | "position">>,
  ) {
    await fetch(`/api/v1/tasks/${task.id}/subtasks/${subtaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(patch),
    });
    await loadBundle();
  }

  async function deleteSubtask(subtaskId: string) {
    await fetch(`/api/v1/tasks/${task.id}/subtasks/${subtaskId}`, {
      method: "DELETE",
      credentials: "include",
    });
    await loadBundle();
  }

  async function addWatcher(userId: string) {
    await fetch(`/api/v1/tasks/${task.id}/watchers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id: userId }),
    });
    await loadBundle();
  }

  async function removeWatcher(userId: string) {
    await fetch(
      `/api/v1/tasks/${task.id}/watchers/${encodeURIComponent(userId)}`,
      { method: "DELETE", credentials: "include" },
    );
    await loadBundle();
  }

  async function setRecurrence(rule: TaskRecurrenceRule | null) {
    await patchTask({ recurrence_rule: rule });
  }

  const membersMentionables = useMemo(
    () => members.map((m) => ({ user_id: m.user_id, full_name: m.full_name })),
    [members],
  );

  const done = task.status === "done";

  return (
    <div className="flex flex-col gap-6">
      {/* Header row */}
      <header className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <button
            onClick={toggleStatus}
            aria-label={done ? "Mark not done" : "Mark done"}
            className={cn(
              "mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm border transition-colors",
              done
                ? "border-success bg-success-subtle text-success"
                : "border-border hover:border-accent",
            )}
          >
            {done ? <Check className="h-3.5 w-3.5" /> : null}
          </button>
          {editingTitle ? (
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveTitle();
                }
                if (e.key === "Escape") {
                  setDraftTitle(task.title);
                  setEditingTitle(false);
                }
              }}
              className="flex-1 rounded-sm border border-border-focus bg-bg-1 px-2 py-1 text-2xl font-semibold text-text-0 outline-none"
            />
          ) : (
            <h1
              onClick={() => setEditingTitle(true)}
              className={cn(
                "flex-1 cursor-text text-2xl font-semibold leading-tight",
                done ? "text-text-3 line-through" : "text-text-0",
              )}
              title="Click to edit"
            >
              {task.title}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-text-3">
          <span className="font-mono">
            {terminal.ticker}-{task.ticker_seq}
          </span>
          <span>·</span>
          <span>
            opened {formatDate(task.created_at)}
            {bundle?.creator.full_name
              ? ` by ${bundle.creator.full_name}`
              : ""}
          </span>
          {task.updated_at !== task.created_at ? (
            <>
              <span>·</span>
              <span>edited {formatDate(task.updated_at)}</span>
            </>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        {/* Main column */}
        <div className="flex flex-col gap-6">
          <SectionCard
            title="Description"
            action={
              !editingDescription ? (
                <button
                  onClick={() => {
                    setDraftDescription(task.description ?? "");
                    setEditingDescription(true);
                  }}
                  className="flex items-center gap-1 text-[11px] text-text-3 hover:text-text-0"
                >
                  <Edit3 className="h-2.5 w-2.5" /> Edit
                </button>
              ) : null
            }
          >
            {editingDescription ? (
              <div className="flex flex-col gap-2">
                <textarea
                  autoFocus
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      void saveDescription();
                    }
                    if (e.key === "Escape") {
                      setDraftDescription(task.description ?? "");
                      setEditingDescription(false);
                    }
                  }}
                  placeholder="Markdown supported. ⌘↵ to save, Esc to cancel."
                  className="min-h-[160px] w-full resize-y rounded border border-border bg-bg-0 p-3 text-sm text-text-0 outline-none focus:border-border-focus"
                />
                <div className="flex items-center justify-end gap-2 text-xs">
                  <button
                    onClick={() => {
                      setDraftDescription(task.description ?? "");
                      setEditingDescription(false);
                    }}
                    className="text-text-3 hover:text-text-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveDescription}
                    className="rounded-sm bg-accent px-3 py-1 text-bg-0 hover:opacity-90"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : task.description && task.description.trim() ? (
              <Markdown source={task.description} />
            ) : (
              <button
                onClick={() => {
                  setDraftDescription("");
                  setEditingDescription(true);
                }}
                className="text-xs text-text-3 hover:text-text-1"
              >
                No description yet — click to add one.
              </button>
            )}
          </SectionCard>

          <SectionCard
            title="Subtasks"
            icon={<ListChecks className="h-2.5 w-2.5" />}
          >
            <SubtaskBlock
              subtasks={bundle?.subtasks ?? []}
              onAdd={addSubtask}
              onPatch={patchSubtask}
              onDelete={deleteSubtask}
            />
          </SectionCard>

          <SectionCard
            title="Dependencies"
            icon={<GitBranch className="h-2.5 w-2.5" />}
          >
            <DependencyBlock
              depsOut={bundle?.depends_on ?? []}
              depsIn={bundle?.blocks ?? []}
              siblings={siblings}
              terminalTicker={terminal.ticker}
              onAdd={addDependency}
              onRemove={removeDependency}
            />
          </SectionCard>

          <SectionCard title="Tags" icon={<TagIcon className="h-2.5 w-2.5" />}>
            <LabelBlock labels={task.labels ?? []} onChange={setLabels} />
          </SectionCard>

          <SectionCard
            title="History"
            icon={<LinkIcon className="h-2.5 w-2.5" />}
          >
            {loadingBundle && !bundle ? (
              <p className="text-[11px] text-text-3">Loading…</p>
            ) : (
              <HistoryTimeline
                entityType="task"
                entityId={task.id}
                initialRows={(bundle?.activity ?? []) as HistoryRow[]}
                actorNames={buildActorNameMap({
                  members,
                  creator: bundle?.creator ?? null,
                })}
              />
            )}
          </SectionCard>
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-3 text-xs">
          <SidebarRow
            label="Status"
            right={
              <select
                value={task.status}
                onChange={(e) =>
                  patchTask({ status: e.target.value as TaskStatus })
                }
                className="rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 text-[11px] text-text-0 outline-none focus:border-border-focus"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            }
          >
            <StatusPill status={task.status} />
          </SidebarRow>

          <SidebarRow
            label="Priority"
            right={
              <select
                value={task.priority}
                onChange={(e) =>
                  patchTask({ priority: Number(e.target.value) })
                }
                className="rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 text-[11px] text-text-0 outline-none focus:border-border-focus"
              >
                <option value={1}>Urgent</option>
                <option value={2}>High</option>
                <option value={3}>Medium</option>
                <option value={4}>Low</option>
              </select>
            }
          >
            <PriorityChip priority={task.priority} />
          </SidebarRow>

          <SidebarRow
            label="Due"
            right={
              <input
                type="date"
                value={task.due_date ?? ""}
                onChange={(e) =>
                  patchTask({ due_date: e.target.value || null })
                }
                className="rounded-sm border border-border bg-bg-2 px-1 py-0.5 text-[11px] text-text-0 outline-none focus:border-border-focus"
              />
            }
          >
            {task.due_date ? <DueChip date={task.due_date} /> : <span className="text-text-3">—</span>}
          </SidebarRow>

          <SidebarBlock label="Assignees">
            <AssigneeBlock
              assignees={bundle?.assignees ?? []}
              members={members}
              onAdd={addAssignee}
              onRemove={removeAssignee}
            />
          </SidebarBlock>

          <SidebarBlock
            label={
              <span className="flex items-center gap-1">
                <Eye className="h-2.5 w-2.5" /> Watchers
              </span>
            }
          >
            <WatcherBlock
              watchers={bundle?.watchers ?? []}
              members={members}
              currentUserId={currentUserId}
              onAdd={addWatcher}
              onRemove={removeWatcher}
            />
          </SidebarBlock>

          <SidebarBlock
            label={
              <span className="flex items-center gap-1">
                <Repeat className="h-2.5 w-2.5" /> Repeats
              </span>
            }
          >
            <RecurrenceBlock
              rule={task.recurrence_rule ?? null}
              onChange={setRecurrence}
            />
          </SidebarBlock>

          <SidebarBlock label="Opened by">
            <div className="flex items-center gap-2">
              <Avatar
                name={bundle?.creator.full_name ?? null}
                size="xs"
              />
              <span className="text-text-1">
                {bundle?.creator.full_name ?? "someone"}
              </span>
            </div>
          </SidebarBlock>
        </aside>
      </div>

      {/* Comments span full width below */}
      <div className="h-[420px] overflow-hidden rounded border border-border">
        <CommentThread
          entityType="task"
          entityId={task.id}
          projectId={terminal.id}
          mentionables={membersMentionables}
          label={`${terminal.ticker}-${task.ticker_seq} discussion`}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- */
/* Composable bits                                                      */
/* ------------------------------------------------------------------- */

function SectionCard({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-border bg-bg-1">
      <header className="flex h-9 items-center justify-between border-b border-border px-3">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
          {icon}
          {title}
        </span>
        {action}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function SidebarRow({
  label,
  right,
  children,
}: {
  label: string;
  right: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-border bg-bg-1 px-3 py-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
          {label}
        </span>
        <span className="text-text-1">{children}</span>
      </div>
      {right}
    </div>
  );
}

function SidebarBlock({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded border border-border bg-bg-1 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
        {label}
      </span>
      {children}
    </div>
  );
}

function AssigneeBlock({
  assignees,
  members,
  onAdd,
  onRemove,
}: {
  assignees: Assignee[];
  members: Member[];
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const assignedIds = new Set(assignees.map((a) => a.user_id));
  const candidates = members.filter((m) => !assignedIds.has(m.user_id));
  return (
    <div className="flex flex-col gap-1.5">
      {assignees.length === 0 ? (
        <span className="text-[11px] text-text-3">No one yet.</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {assignees.map((a) => (
            <li
              key={a.user_id}
              className="group flex items-center gap-2"
            >
              <Avatar name={a.full_name} size="xs" />
              <span className="flex-1 truncate text-text-1">
                {a.full_name ?? "someone"}
              </span>
              <button
                onClick={() => onRemove(a.user_id)}
                aria-label="Unassign"
                className="rounded-sm p-0.5 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-danger group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {picking ? (
        <div className="flex flex-col gap-1">
          {candidates.length === 0 ? (
            <span className="text-[11px] text-text-3">
              Everyone&apos;s already on it.
            </span>
          ) : (
            <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
              {candidates.map((m) => (
                <li key={m.user_id}>
                  <button
                    onClick={() => {
                      onAdd(m.user_id);
                      setPicking(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left hover:bg-bg-2"
                  >
                    <Avatar name={m.full_name} size="xs" />
                    <span className="flex-1 truncate text-text-1">
                      {m.full_name ?? "someone"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => setPicking(false)}
            className="text-[11px] text-text-3 hover:text-text-1"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] text-text-3 hover:bg-bg-2 hover:text-text-0"
        >
          <Plus className="h-2.5 w-2.5" /> Assign
        </button>
      )}
    </div>
  );
}

function DependencyBlock({
  depsOut,
  depsIn,
  siblings,
  terminalTicker,
  onAdd,
  onRemove,
}: {
  depsOut: RelatedTask[];
  depsIn: RelatedTask[];
  siblings: Sibling[];
  terminalTicker: string;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const existingIds = new Set([
    ...depsOut.map((d) => d.id),
    ...depsIn.map((d) => d.id),
  ]);
  const filtered = query.trim()
    ? siblings.filter(
        (s) =>
          !existingIds.has(s.id) &&
          s.title.toLowerCase().includes(query.toLowerCase()),
      ).slice(0, 8)
    : siblings.filter((s) => !existingIds.has(s.id)).slice(0, 8);
  return (
    <div className="flex flex-col gap-3 text-xs">
      <DepList
        heading="Blocked by"
        items={depsOut}
        terminalTicker={terminalTicker}
        onRemove={onRemove}
        emptyLabel="Not waiting on anything."
      />
      <DepList
        heading="Blocks"
        items={depsIn}
        terminalTicker={terminalTicker}
        emptyLabel="Nothing waits on this."
      />
      {picking ? (
        <div className="flex flex-col gap-1 rounded-sm border border-border bg-bg-0 p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="w-full rounded-sm border border-border bg-bg-1 px-2 py-1 text-xs text-text-0 outline-none focus:border-border-focus"
          />
          {filtered.length === 0 ? (
            <span className="px-2 py-1 text-[11px] text-text-3">
              No matches.
            </span>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      onAdd(s.id);
                      setPicking(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left hover:bg-bg-2"
                  >
                    <TickerChip>
                      {terminalTicker}-{s.ticker_seq}
                    </TickerChip>
                    <span className="flex-1 truncate text-text-1">
                      {s.title}
                    </span>
                    <StatusPill status={s.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => {
              setPicking(false);
              setQuery("");
            }}
            className="self-end text-[11px] text-text-3 hover:text-text-1"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="flex items-center gap-1 self-start rounded-sm px-1 py-0.5 text-[11px] text-text-3 hover:bg-bg-2 hover:text-text-0"
        >
          <Plus className="h-2.5 w-2.5" /> Add dependency
        </button>
      )}
    </div>
  );
}

function DepList({
  heading,
  items,
  terminalTicker,
  onRemove,
  emptyLabel,
}: {
  heading: string;
  items: RelatedTask[];
  terminalTicker: string;
  onRemove?: (id: string) => void;
  emptyLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
        {heading}
      </span>
      {items.length === 0 ? (
        <span className="text-[11px] text-text-3">{emptyLabel}</span>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-bg-2"
            >
              <Link
                href={`/p/${terminalTicker}/task/${t.ticker_seq}`}
                className="flex flex-1 items-center gap-2"
              >
                <TickerChip>
                  {terminalTicker}-{t.ticker_seq}
                </TickerChip>
                <span className="flex-1 truncate text-text-1">{t.title}</span>
                <StatusPill status={t.status} />
              </Link>
              {onRemove ? (
                <button
                  onClick={() => onRemove(t.id)}
                  aria-label="Remove dependency"
                  className="rounded-sm p-0.5 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LabelBlock({
  labels,
  onChange,
}: {
  labels: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {labels.map((l) => (
        <span
          key={l}
          className="group flex items-center gap-1 rounded-sm bg-bg-2 px-1.5 py-0.5 text-[11px] text-text-1"
        >
          {l}
          <button
            onClick={() => onChange(labels.filter((x) => x !== l))}
            aria-label={`Remove ${l}`}
            className="rounded-sm p-0.5 text-text-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            const next = Array.from(new Set([...labels, draft.trim()]));
            setDraft("");
            onChange(next);
          }
          if (e.key === "Backspace" && !draft && labels.length > 0) {
            onChange(labels.slice(0, -1));
          }
        }}
        placeholder={labels.length === 0 ? "Add a label and hit Enter" : "+"}
        className="min-w-[80px] flex-1 rounded-sm bg-transparent px-1 py-0.5 text-[11px] text-text-0 outline-none placeholder:text-text-3 focus:bg-bg-2"
      />
    </div>
  );
}

/* ------------------------------------------------------------------- */
/* PriorityChip — color-coded chip per spec (gray/blue/orange/red)      */
/* ------------------------------------------------------------------- */

const PRIORITY_TONE: Record<number, { tone: string; label: string }> = {
  1: { tone: "bg-danger-subtle text-danger", label: "Urgent" },
  2: { tone: "bg-warning-subtle text-warning", label: "High" },
  3: { tone: "bg-info-subtle text-info", label: "Medium" },
  4: { tone: "bg-bg-3 text-text-2", label: "Low" },
};

function PriorityChip({ priority }: { priority: number }) {
  const meta = PRIORITY_TONE[priority] ?? PRIORITY_TONE[3];
  return (
    <span
      className={cn(
        "rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
        meta.tone,
      )}
    >
      {meta.label}
    </span>
  );
}

/* ------------------------------------------------------------------- */
/* SubtaskBlock — checklist with add / check / delete / reorder         */
/* ------------------------------------------------------------------- */

function SubtaskBlock({
  subtasks,
  onAdd,
  onPatch,
  onDelete,
}: {
  subtasks: Subtask[];
  onAdd: (label: string) => void;
  onPatch: (
    id: string,
    patch: Partial<Pick<Subtask, "label" | "done" | "position">>,
  ) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const sorted = useMemo(
    () => [...subtasks].sort((a, b) => a.position - b.position),
    [subtasks],
  );
  const completed = sorted.filter((s) => s.done).length;

  /**
   * Reorder by swapping positions with the neighbor in the requested direction.
   * Sparse positions mean we don't need to rewrite every row — but for
   * simple up/down moves swap is plenty.
   */
  function move(id: string, dir: "up" | "down") {
    const idx = sorted.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const swapWith = dir === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= sorted.length) return;
    const a = sorted[idx]!;
    const b = sorted[swapWith]!;
    onPatch(a.id, { position: b.position });
    onPatch(b.id, { position: a.position });
  }

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {sorted.length > 0 ? (
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-text-3">
          <span>
            {completed} / {sorted.length} done
          </span>
        </div>
      ) : null}
      <ul className="flex flex-col">
        {sorted.map((s, i) => (
          <li key={s.id} className="group flex items-center gap-2 py-1">
            <button
              onClick={() => move(s.id, "up")}
              disabled={i === 0}
              className="text-text-3 opacity-0 transition-opacity hover:text-text-0 disabled:cursor-not-allowed disabled:opacity-0 group-hover:opacity-100"
              aria-label="Move up"
            >
              <GripVertical className="h-3 w-3" />
            </button>
            <button
              onClick={() => onPatch(s.id, { done: !s.done })}
              aria-label={s.done ? "Mark incomplete" : "Mark complete"}
              className={cn(
                "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border",
                s.done
                  ? "border-success bg-success-subtle text-success"
                  : "border-border hover:border-accent",
              )}
            >
              {s.done ? <Check className="h-3 w-3" /> : null}
            </button>
            {editingId === s.id ? (
              <input
                autoFocus
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onBlur={() => {
                  const next = editLabel.trim();
                  setEditingId(null);
                  if (next && next !== s.label) onPatch(s.id, { label: next });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                  if (e.key === "Escape") {
                    setEditingId(null);
                  }
                }}
                className="flex-1 rounded-sm border border-border-focus bg-bg-1 px-1 py-0.5 text-xs text-text-0 outline-none"
              />
            ) : (
              <button
                onClick={() => {
                  setEditingId(s.id);
                  setEditLabel(s.label);
                }}
                className={cn(
                  "flex-1 cursor-text truncate text-left",
                  s.done ? "text-text-3 line-through" : "text-text-1",
                )}
                title="Click to edit"
              >
                {s.label}
              </button>
            )}
            <button
              onClick={() => onDelete(s.id)}
              aria-label="Delete subtask"
              className="rounded-sm p-0.5 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-danger group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            onAdd(draft);
            setDraft("");
          }
        }}
        placeholder={
          sorted.length === 0
            ? "Add a checklist item and hit Enter"
            : "+ Add another"
        }
        className="rounded-sm border border-border bg-bg-0 px-2 py-1 text-xs text-text-0 outline-none placeholder:text-text-3 focus:border-border-focus"
      />
    </div>
  );
}

/* ------------------------------------------------------------------- */
/* WatcherBlock — list + autocomplete add + remove                      */
/* ------------------------------------------------------------------- */

function WatcherBlock({
  watchers,
  members,
  currentUserId,
  onAdd,
  onRemove,
}: {
  watchers: Watcher[];
  members: Member[];
  currentUserId: string;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const watchingIds = new Set(watchers.map((w) => w.user_id));
  const candidates = members.filter((m) => !watchingIds.has(m.user_id));
  const filtered = query.trim()
    ? candidates.filter((m) =>
        (m.full_name ?? "").toLowerCase().includes(query.toLowerCase()),
      )
    : candidates;
  const meWatching = watchingIds.has(currentUserId);

  return (
    <div className="flex flex-col gap-1.5">
      {watchers.length === 0 ? (
        <span className="text-[11px] text-text-3">No watchers.</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {watchers.map((w) => (
            <li key={w.user_id} className="group flex items-center gap-2">
              <Avatar name={w.full_name} size="xs" />
              <span className="flex-1 truncate text-text-1">
                {w.full_name ?? "someone"}
                {w.user_id === currentUserId ? (
                  <span className="text-text-3"> (you)</span>
                ) : null}
              </span>
              <button
                onClick={() => onRemove(w.user_id)}
                aria-label="Remove watcher"
                className="rounded-sm p-0.5 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-danger group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!meWatching ? (
        <button
          onClick={() => onAdd(currentUserId)}
          className="flex items-center gap-1 self-start rounded-sm px-1 py-0.5 text-[11px] text-text-3 hover:bg-bg-2 hover:text-text-0"
        >
          <Eye className="h-2.5 w-2.5" /> Watch
        </button>
      ) : (
        <button
          onClick={() => onRemove(currentUserId)}
          className="flex items-center gap-1 self-start rounded-sm px-1 py-0.5 text-[11px] text-text-3 hover:bg-bg-2 hover:text-text-0"
        >
          <X className="h-2.5 w-2.5" /> Stop watching
        </button>
      )}
      {picking ? (
        <div className="flex flex-col gap-1 rounded-sm border border-border bg-bg-0 p-1">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members…"
            className="w-full rounded-sm border border-border bg-bg-1 px-2 py-0.5 text-[11px] text-text-0 outline-none focus:border-border-focus"
          />
          {filtered.length === 0 ? (
            <span className="px-1 py-0.5 text-[11px] text-text-3">
              No matches.
            </span>
          ) : (
            <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
              {filtered.map((m) => (
                <li key={m.user_id}>
                  <button
                    onClick={() => {
                      onAdd(m.user_id);
                      setPicking(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left hover:bg-bg-2"
                  >
                    <Avatar name={m.full_name} size="xs" />
                    <span className="flex-1 truncate text-text-1">
                      {m.full_name ?? "someone"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => {
              setPicking(false);
              setQuery("");
            }}
            className="self-end text-[11px] text-text-3 hover:text-text-1"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="flex items-center gap-1 self-start rounded-sm px-1 py-0.5 text-[11px] text-text-3 hover:bg-bg-2 hover:text-text-0"
        >
          <Plus className="h-2.5 w-2.5" /> Add watcher
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- */
/* RecurrenceBlock — "Repeat every N days/weeks/months"                  */
/* ------------------------------------------------------------------- */

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function RecurrenceBlock({
  rule,
  onChange,
}: {
  rule: TaskRecurrenceRule | null;
  onChange: (next: TaskRecurrenceRule | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TaskRecurrenceRule>(
    rule ?? { pattern: "weekly", interval: 1, weekdays: [] },
  );

  if (!rule && !editing) {
    return (
      <button
        onClick={() => {
          setDraft({ pattern: "weekly", interval: 1, weekdays: [] });
          setEditing(true);
        }}
        className="flex items-center gap-1 self-start rounded-sm px-1 py-0.5 text-[11px] text-text-3 hover:bg-bg-2 hover:text-text-0"
      >
        <Plus className="h-2.5 w-2.5" /> Set repeat
      </button>
    );
  }

  if (!editing && rule) {
    return (
      <div className="flex flex-col gap-1 text-[11px]">
        <span className="text-text-1">{summarize(rule)}</span>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setDraft(rule);
              setEditing(true);
            }}
            className="text-text-3 hover:text-text-0"
          >
            Edit
          </button>
          <button
            onClick={() => onChange(null)}
            className="text-text-3 hover:text-danger"
          >
            Clear
          </button>
        </div>
      </div>
    );
  }

  function toggleWeekday(d: number) {
    const days = new Set(draft.weekdays ?? []);
    if (days.has(d)) days.delete(d);
    else days.add(d);
    setDraft({ ...draft, weekdays: Array.from(days).sort() });
  }

  return (
    <div className="flex flex-col gap-2 text-[11px]">
      <div className="flex items-center gap-1">
        <span className="text-text-3">every</span>
        <input
          type="number"
          min={1}
          value={draft.interval}
          onChange={(e) =>
            setDraft({ ...draft, interval: Math.max(1, Number(e.target.value) || 1) })
          }
          className="w-12 rounded-sm border border-border bg-bg-2 px-1 py-0.5 text-text-0 outline-none focus:border-border-focus"
        />
        <select
          value={draft.pattern}
          onChange={(e) =>
            setDraft({
              ...draft,
              pattern: e.target.value as TaskRecurrenceRule["pattern"],
            })
          }
          className="rounded-sm border border-border bg-bg-2 px-1 py-0.5 text-text-0 outline-none focus:border-border-focus"
        >
          <option value="daily">day(s)</option>
          <option value="weekly">week(s)</option>
          <option value="monthly">month(s)</option>
        </select>
      </div>
      {draft.pattern === "weekly" ? (
        <div className="flex items-center gap-0.5">
          {WEEKDAY_LABELS.map((lbl, idx) => {
            const active = (draft.weekdays ?? []).includes(idx);
            return (
              <button
                key={idx}
                onClick={() => toggleWeekday(idx)}
                className={cn(
                  "h-5 w-5 rounded-sm text-[10px] font-mono",
                  active
                    ? "bg-accent text-bg-0"
                    : "border border-border bg-bg-2 text-text-3 hover:text-text-0",
                )}
                aria-pressed={active}
                aria-label={`Toggle ${lbl}`}
              >
                {lbl}
              </button>
            );
          })}
        </div>
      ) : null}
      <label className="flex items-center gap-1 text-text-3">
        Until
        <input
          type="date"
          value={draft.end_date ?? ""}
          onChange={(e) =>
            setDraft({ ...draft, end_date: e.target.value || undefined })
          }
          className="rounded-sm border border-border bg-bg-2 px-1 py-0.5 text-text-0 outline-none focus:border-border-focus"
        />
      </label>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setEditing(false)}
          className="text-text-3 hover:text-text-1"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            onChange(draft);
            setEditing(false);
          }}
          className="rounded-sm bg-accent px-2 py-0.5 text-bg-0 hover:opacity-90"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function summarize(rule: TaskRecurrenceRule): string {
  const u =
    rule.pattern === "daily"
      ? rule.interval === 1
        ? "day"
        : "days"
      : rule.pattern === "weekly"
        ? rule.interval === 1
          ? "week"
          : "weeks"
        : rule.interval === 1
          ? "month"
          : "months";
  let s = `Every ${rule.interval} ${u}`;
  if (rule.pattern === "weekly" && rule.weekdays && rule.weekdays.length > 0) {
    s += ` on ${rule.weekdays.map((d) => WEEKDAY_LABELS[d]).join("")}`;
  }
  if (rule.end_date) s += `, until ${rule.end_date}`;
  return s;
}

/* ------------------------------------------------------------------- */
/* Helpers                                                              */
/* ------------------------------------------------------------------- */

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Build a user_id → name map for the History timeline. Pulls from the
 * terminal members already loaded for the assignee picker, plus the task
 * creator from the bundle.
 */
function buildActorNameMap({
  members,
  creator,
}: {
  members: Member[];
  creator: { user_id: string; full_name: string | null } | null;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of members) {
    if (m.full_name) out[m.user_id] = m.full_name;
  }
  if (creator && creator.full_name) {
    out[creator.user_id] = creator.full_name;
  }
  return out;
}
