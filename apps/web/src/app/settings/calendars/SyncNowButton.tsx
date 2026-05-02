"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

/**
 * Sync-now button — POSTs /api/v1/calendar/sync-now and refreshes the
 * server component so the new last_sync_at + event count render.
 * Shows a small inline result toast so the user gets feedback even if
 * 0 events were synced (otherwise nothing visibly changes).
 */
export function SyncNowButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    kind: "success" | "danger";
    text: string;
  } | null>(null);

  return (
    <div className="flex items-center gap-2">
      {feedback ? (
        <span
          className={`text-[10px] ${
            feedback.kind === "success" ? "text-success" : "text-danger"
          }`}
          role="status"
        >
          {feedback.text}
        </span>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setFeedback(null);
          startTransition(async () => {
            try {
              const res = await fetch("/api/v1/calendar/sync-now", {
                method: "POST",
              });
              if (!res.ok) {
                setFeedback({ kind: "danger", text: `Sync failed (${res.status})` });
                return;
              }
              const body = (await res.json()) as {
                data?: {
                  attempted: number;
                  succeeded: number;
                  failed: number;
                  events: number;
                };
              };
              const d = body.data;
              if (!d) {
                setFeedback({ kind: "danger", text: "Sync failed (no data)" });
                return;
              }
              setFeedback({
                kind: d.failed > 0 ? "danger" : "success",
                text:
                  d.failed > 0
                    ? `${d.failed} of ${d.attempted} failed`
                    : `Synced ${d.events} event${d.events === 1 ? "" : "s"}`,
              });
              router.refresh();
              window.setTimeout(() => setFeedback(null), 4000);
            } catch (e) {
              setFeedback({
                kind: "danger",
                text: e instanceof Error ? e.message : "Network error",
              });
            }
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-bg-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-1 hover:bg-bg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Sync now"
        title="Run a sync tick now"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
        )}
        {pending ? "Syncing…" : "Sync"}
      </button>
    </div>
  );
}
