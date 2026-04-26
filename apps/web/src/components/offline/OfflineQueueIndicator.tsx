"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw, Trash2, X, AlertTriangle } from "lucide-react";
import {
  discardEntry,
  listQueue,
  onQueueChanged,
  processQueue,
  queueSize,
  retryEntry,
  type QueueEntry,
} from "@/lib/offline-queue";
import { cn } from "@/lib/utils";

/**
 * Pinned bottom-right indicator showing pending+failed offline mutations.
 * Hidden when the queue is empty.
 *
 * Click to expand a panel that lists every entry with retry/discard
 * buttons. We deliberately do not surface the synced count or any
 * historical record — once a mutation lands on the server the user gets
 * the underlying realtime/optimistic-update feedback.
 */
export function OfflineQueueIndicator() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<QueueEntry[]>([]);

  const refresh = useCallback(async () => {
    const next = await listQueue();
    setEntries(next);
    setCount(next.length);
  }, []);

  // Initial mount: process any leftover queue from a prior session, then
  // poll the count once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await processQueue();
      } catch {
        // Surface via the queue display rather than throwing here.
      }
      if (cancelled) return;
      try {
        const c = await queueSize();
        if (!cancelled) setCount(c);
      } catch {
        // IDB unavailable (private mode in some browsers); just hide.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // React to queue mutations from anywhere in the app.
  useEffect(() => {
    return onQueueChanged(() => {
      void (async () => {
        const c = await queueSize();
        setCount(c);
        if (open) await refresh();
      })();
    });
  }, [open, refresh]);

  // When the panel opens, load the full list.
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // Drain on `online` events.
  useEffect(() => {
    const onOnline = () => {
      void processQueue().catch(() => {
        // Surface via the queue display.
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  if (count === 0 && !open) return null;

  const failedCount = entries.filter((e) => e.status === "failed").length;

  return (
    <div className="fixed bottom-4 right-4 z-[1100] flex flex-col items-end gap-2">
      {open ? (
        <Panel
          entries={entries}
          onClose={() => setOpen(false)}
          onRetry={async (id) => {
            await retryEntry(id);
            await refresh();
          }}
          onDiscard={async (id) => {
            await discardEntry(id);
            await refresh();
          }}
        />
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${count} offline ${count === 1 ? "mutation" : "mutations"} pending`}
        className={cn(
          "flex items-center gap-1.5 rounded-sm border border-border bg-bg-1 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider shadow-lg transition-colors hover:bg-bg-2",
          failedCount > 0
            ? "text-danger"
            : count > 0
              ? "text-warning"
              : "text-text-2",
        )}
      >
        {failedCount > 0 ? (
          <AlertTriangle className="h-3 w-3" />
        ) : (
          <CloudOff className="h-3 w-3" />
        )}
        Queue
        <span className="font-mono text-[10px] text-text-3">{count}</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Expanded panel                                                      */
/* ------------------------------------------------------------------ */

interface PanelProps {
  entries: QueueEntry[];
  onClose: () => void;
  onRetry: (id: number) => Promise<void>;
  onDiscard: (id: number) => Promise<void>;
}

function Panel({ entries, onClose, onRetry, onDiscard }: PanelProps) {
  return (
    <div className="flex w-[360px] flex-col rounded-sm border border-border bg-bg-1 shadow-xl">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-text-1">
          <CloudOff className="h-3 w-3" />
          Offline queue
          <span className="font-mono text-[10px] text-text-3">
            {entries.length}
          </span>
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-sm p-0.5 text-text-3 hover:bg-bg-2 hover:text-text-0"
        >
          <X className="h-3 w-3" />
        </button>
      </header>
      <div className="max-h-[420px] overflow-y-auto">
        {entries.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-text-3">
            Nothing pending.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <li key={e.id} className="px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-text-0">
                      {e.label ?? `${e.method} ${shortPath(e.url)}`}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-text-3">
                      <span>{e.method}</span>
                      <span className="truncate">{shortPath(e.url)}</span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-[10px]">
                      <StatusChip status={e.status} />
                      <span className="text-text-3">
                        {formatAge(e.createdAt)}
                      </span>
                      {e.attempts > 0 ? (
                        <span className="text-text-3">
                          ·{" "}
                          {e.attempts === 1
                            ? "1 attempt"
                            : `${e.attempts} attempts`}
                        </span>
                      ) : null}
                    </p>
                    {e.lastError ? (
                      <p className="mt-1 break-words font-mono text-[10px] text-danger">
                        {e.lastError}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void onRetry(e.id)}
                      title="Retry now"
                      aria-label="Retry"
                      className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDiscard(e.id)}
                      title="Discard"
                      aria-label="Discard"
                      className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-danger"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="border-t border-border px-3 py-2 text-[10px] text-text-3">
        Mutations sync automatically when you reconnect.
      </footer>
    </div>
  );
}

function StatusChip({ status }: { status: QueueEntry["status"] }) {
  if (status === "failed") {
    return (
      <span className="rounded-sm bg-danger-subtle px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-danger">
        failed
      </span>
    );
  }
  if (status === "syncing") {
    return (
      <span className="rounded-sm bg-info-subtle px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-info">
        syncing
      </span>
    );
  }
  return (
    <span className="rounded-sm bg-warning-subtle px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-warning">
      pending
    </span>
  );
}

function shortPath(url: string): string {
  try {
    const u = new URL(url, "http://x");
    return u.pathname + (u.search ? u.search : "");
  } catch {
    return url;
  }
}

function formatAge(ts: number): string {
  const ms = Date.now() - ts;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
