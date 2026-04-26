"use client";

import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { Button } from "./ui/Button";

interface MergeTaskDialogProps {
  open: boolean;
  onClose: () => void;
  /** Task being dragged onto another. Becomes the loser. */
  source: { id: string; title: string };
  /** Task being dropped onto. Becomes the winner. */
  target: { id: string; title: string };
  /** Called after a successful merge with the target id. */
  onMerged: (targetId: string) => void;
}

/**
 * Confirmation dialog for the task-onto-task drop. Two checkboxes (both
 * sensible defaults), a brief explanation of what happens to the source,
 * and a single primary action.
 *
 * Network errors land in an inline strip — the user keeps the dialog
 * open so they can retry without re-dragging.
 */
export function MergeTaskDialog({
  open,
  onClose,
  source,
  target,
  onMerged,
}: MergeTaskDialogProps) {
  const [moveSubtasks, setMoveSubtasks] = useState(true);
  const [combineDescriptions, setCombineDescriptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the dialog opens for a new pair.
  useEffect(() => {
    if (open) {
      setMoveSubtasks(true);
      setCombineDescriptions(true);
      setError(null);
      setSubmitting(false);
    }
  }, [open, source.id, target.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/tasks/${source.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_id: target.id,
          move_subtasks: moveSubtasks,
          combine_descriptions: combineDescriptions,
        }),
        credentials: "include",
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(body.errors?.[0]?.message ?? "Merge failed");
        setSubmitting(false);
        return;
      }
      onMerged(target.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Merge tasks">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-sm border border-border bg-bg-2 p-3 text-xs text-text-1">
          <p>
            <span className="font-mono text-text-3">source</span>{" "}
            <span className="font-medium text-text-0">&ldquo;{source.title}&rdquo;</span>
            <span className="text-text-3"> will be merged into </span>
            <span className="font-mono text-text-3">target</span>{" "}
            <span className="font-medium text-text-0">&ldquo;{target.title}&rdquo;</span>
            <span className="text-text-3">.</span>
          </p>
          <p className="mt-1 text-text-3">
            Comments and attachments always move. The source is closed and tagged
            as merged — it stays visible in history but won&apos;t clutter the active list.
          </p>
        </div>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-text-1">
            <input
              type="checkbox"
              checked={moveSubtasks}
              onChange={(e) => setMoveSubtasks(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded-sm accent-accent"
            />
            <span>
              Move subtasks to target
              <span className="block text-xs text-text-3">
                Re-parents every checklist item under {target.title}.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-text-1">
            <input
              type="checkbox"
              checked={combineDescriptions}
              onChange={(e) => setCombineDescriptions(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded-sm accent-accent"
            />
            <span>
              Combine descriptions
              <span className="block text-xs text-text-3">
                Appends the source&apos;s description below the target&apos;s, with a
                divider.
              </span>
            </span>
          </label>
        </div>

        {error ? (
          <p className="rounded-sm border border-danger/40 bg-danger-subtle px-2 py-1.5 text-xs text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" loading={submitting}>
            Merge
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
