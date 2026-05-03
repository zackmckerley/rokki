"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Subtask {
  id: string;
  task_id: string;
  label: string;
  done: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

interface SubtasksListProps {
  taskId: string;
  /** Already-loaded subtasks. Empty array = "loaded but none yet". */
  subtasks: Subtask[] | null;
  /** Called when the parent's subtasks state should be replaced. */
  onChange: (next: Subtask[]) => void;
}

/**
 * Inline subtask checklist for an expanded task row in `TasksPane`.
 *
 * Renders below the parent row, indented, with:
 *   - one row per subtask: checkbox + label + delete button
 *   - a "+ subtask" composer at the bottom
 *   - roll-up "{done} / {total}" count to the right of "+ subtask"
 *
 * The component is dumb — it owns no fetch logic. The parent
 * (`TasksPane`) is responsible for fetching the initial list and
 * for replacing it after mutations succeed. We use optimistic
 * updates locally so the UI stays responsive while the network
 * call finishes; on error we ask the parent to reload.
 */
export function SubtasksList({
  taskId,
  subtasks,
  onChange,
}: SubtasksListProps) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the composer when the subtask section mounts. Mirrors
  // the parent task composer's behaviour — feels natural after the
  // user just clicked the chevron to expand.
  useEffect(() => {
    inputRef.current?.focus();
  }, [taskId]);

  const list = subtasks ?? [];
  const done = list.filter((s) => s.done).length;
  const total = list.length;

  async function addSubtask() {
    const label = draft.trim();
    if (!label || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/tasks/${taskId}/subtasks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const body = (await r.json().catch(() => ({}))) as {
        data?: Subtask;
        errors?: { message: string }[];
      };
      if (!r.ok || !body.data) {
        setError(
          body.errors?.[0]?.message ?? `Failed to add (HTTP ${r.status})`,
        );
        return;
      }
      onChange([...list, body.data]);
      setDraft("");
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleDone(s: Subtask) {
    const next = !s.done;
    // Optimistic flip.
    onChange(list.map((x) => (x.id === s.id ? { ...x, done: next } : x)));
    try {
      const r = await fetch(
        `/api/v1/tasks/${taskId}/subtasks/${s.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: next }),
        },
      );
      if (!r.ok) {
        // Roll back on failure — surface a toast in a follow-up.
        onChange(list);
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(body.errors?.[0]?.message ?? "Failed to update");
      }
    } catch {
      onChange(list);
      setError("Network error");
    }
  }

  async function deleteSubtask(s: Subtask) {
    // Optimistic remove.
    onChange(list.filter((x) => x.id !== s.id));
    try {
      const r = await fetch(
        `/api/v1/tasks/${taskId}/subtasks/${s.id}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!r.ok && r.status !== 204) {
        onChange(list);
        setError(`Delete failed (HTTP ${r.status})`);
      }
    } catch {
      onChange(list);
      setError("Network error");
    }
  }

  return (
    <div className="border-t border-border bg-bg-1/40 pl-12 pr-4">
      {subtasks === null ? (
        <p className="py-2 text-[11px] text-text-3">Loading subtasks…</p>
      ) : null}

      {list.length > 0 ? (
        <ul className="divide-y divide-border/40 py-1">
          {list.map((s) => (
            <li
              key={s.id}
              className="group flex items-center gap-3 py-1.5 text-xs"
            >
              <button
                type="button"
                onClick={() => void toggleDone(s)}
                aria-label={s.done ? "Mark as not done" : "Mark as done"}
                className={cn(
                  "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-sm border",
                  s.done
                    ? "border-success bg-success-subtle text-success"
                    : "border-border hover:border-accent",
                )}
              >
                {s.done ? (
                  <Check className="h-2.5 w-2.5" aria-hidden="true" />
                ) : null}
              </button>
              <span
                className={cn(
                  "flex-1 truncate",
                  s.done ? "text-text-3 line-through" : "text-text-1",
                )}
              >
                {s.label}
              </span>
              <button
                type="button"
                onClick={() => void deleteSubtask(s)}
                aria-label={`Delete subtask "${s.label}"`}
                className="rounded-sm p-1 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void addSubtask();
        }}
        className="flex items-center gap-2 py-1.5 text-xs"
      >
        <Plus
          className="h-3 w-3 flex-shrink-0 text-text-3"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Add a subtask…"
          aria-label="New subtask"
          className="flex-1 bg-transparent text-xs text-text-0 placeholder:text-text-3 outline-none"
          disabled={submitting}
        />
        {total > 0 ? (
          <span className="font-mono text-[10px] text-text-3">
            {done} / {total}
          </span>
        ) : null}
        <button
          type="submit"
          disabled={submitting || !draft.trim()}
          className={cn(
            "rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            submitting || !draft.trim()
              ? "cursor-not-allowed text-text-3"
              : "text-accent hover:bg-accent-subtle",
          )}
        >
          Add
        </button>
      </form>

      {error ? (
        <p className="pb-2 text-[11px] text-danger">{error}</p>
      ) : null}
    </div>
  );
}
