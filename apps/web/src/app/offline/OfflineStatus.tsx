"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CloudOff,
  RefreshCw,
  Wifi,
  Trash2,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import {
  discardEntry,
  listQueue,
  onQueueChanged,
  processQueue,
  retryEntry,
  type QueueEntry,
} from "@/lib/offline-queue";
import { useOnlineStatus } from "@/lib/use-online-status";
import { cn } from "@/lib/utils";

/**
 * Bloomberg-styled offline status page. Shows three sections:
 *   1. Connectivity state — live, reflects window.online events.
 *   2. Pending mutations — read from IndexedDB, retry/discard inline.
 *   3. Cached pages you can still open — enumerated from the Cache
 *      Storage API (best-effort; only same-origin GETs that we cached).
 *
 * Mounted by /offline/page.tsx, which Next.js pre-renders so the service
 * worker can return it from cache when a navigation falls through both
 * the network and the page cache.
 */
export function OfflineStatus() {
  const online = useOnlineStatus();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [draining, setDraining] = useState(false);

  const loadQueue = useCallback(async () => {
    try {
      setEntries(await listQueue());
    } catch {
      setEntries([]);
    }
  }, []);

  const loadPages = useCallback(async () => {
    try {
      const out = await listCachedPages();
      setPages(out);
    } catch {
      setPages([]);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
    void loadPages();
    return onQueueChanged(() => {
      void loadQueue();
    });
  }, [loadQueue, loadPages]);

  const onSyncNow = useCallback(async () => {
    setDraining(true);
    try {
      await processQueue();
    } finally {
      setDraining(false);
      await loadQueue();
    }
  }, [loadQueue]);

  const failedCount = entries.filter((e) => e.status === "failed").length;
  const pendingCount = entries.length - failedCount;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between border-b border-border pb-4">
        <Wordmark size="md" />
        <div
          className={cn(
            "flex items-center gap-2 rounded-sm border px-2 py-1 text-[11px] font-mono uppercase tracking-wider",
            online
              ? "border-success/40 bg-success-subtle text-success"
              : "border-warning/40 bg-warning-subtle text-warning",
          )}
        >
          {online ? (
            <>
              <Wifi className="h-3 w-3" /> Online
            </>
          ) : (
            <>
              <CloudOff className="h-3 w-3" /> Offline
            </>
          )}
        </div>
      </header>

      <section>
        <h1 className="text-2xl font-semibold text-text-0">Offline</h1>
        <p className="mt-1 text-sm text-text-2">
          {online ? (
            <>
              You&apos;re back online. Pending changes will sync automatically;
              hit <kbd className="font-mono text-xs text-text-1">sync now</kbd>{" "}
              to push them immediately.
            </>
          ) : (
            <>
              The network is unreachable. Reads come from cache; writes are
              queued in this browser and will sync when you reconnect.
            </>
          )}
        </p>
      </section>

      {/* Pending queue */}
      <section className="rounded border border-border bg-bg-1">
        <header className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
            Pending changes
          </span>
          <div className="flex items-center gap-3 text-[11px] text-text-3">
            <span>
              <span className="font-mono text-text-1">{pendingCount}</span>{" "}
              pending
            </span>
            <span>
              <span
                className={cn(
                  "font-mono",
                  failedCount > 0 ? "text-danger" : "text-text-1",
                )}
              >
                {failedCount}
              </span>{" "}
              failed
            </span>
            <button
              type="button"
              onClick={() => void onSyncNow()}
              disabled={!online || entries.length === 0 || draining}
              className="flex items-center gap-1 rounded-sm border border-border bg-bg-2 px-2 py-1 text-[11px] text-text-1 hover:bg-bg-3 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw
                className={cn("h-3 w-3", draining && "animate-spin")}
              />
              Sync now
            </button>
          </div>
        </header>
        <div>
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-3">
              Nothing queued.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.id} className="px-3 py-2 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-text-0">
                        {e.label ?? `${e.method} ${e.url}`}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-text-3">
                        <span className="text-text-2">{e.method}</span>
                        <span className="truncate">{e.url}</span>
                        <span>·</span>
                        <span>{formatAge(e.createdAt)}</span>
                        {e.attempts > 0 ? (
                          <span>
                            ·{" "}
                            {e.attempts === 1
                              ? "1 try"
                              : `${e.attempts} tries`}
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
                        onClick={() => void retryEntry(e.id).then(loadQueue)}
                        title="Retry"
                        aria-label="Retry"
                        className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void discardEntry(e.id).then(loadQueue)}
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
      </section>

      {/* Cached pages */}
      <section className="rounded border border-border bg-bg-1">
        <header className="border-b border-border px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
            Available offline
          </span>
        </header>
        <div>
          {pages.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-3">
              No cached pages yet. Visit a page once while online to make it
              available offline.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              <li>
                <Link
                  href="/"
                  className="flex items-center gap-2 px-3 py-2 text-xs text-text-1 hover:bg-bg-2"
                >
                  <ArrowRight className="h-3 w-3 text-text-3" />
                  <span className="font-mono">/</span>
                  <span className="ml-auto text-[10px] text-text-3">
                    dashboard
                  </span>
                </Link>
              </li>
              {pages.map((p) => (
                <li key={p}>
                  <Link
                    href={p}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-text-1 hover:bg-bg-2"
                  >
                    <ExternalLink className="h-3 w-3 text-text-3" />
                    <span className="truncate font-mono">{p}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <footer className="text-center text-[10px] font-mono uppercase tracking-wider text-text-3">
        Rokki · offline mode v1
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Reads cached page URLs from any cache whose name starts with
 * `rokki-pages-`. Only same-origin GETs make it into that cache, so the
 * resulting list is safe to surface as "go here".
 */
async function listCachedPages(): Promise<string[]> {
  if (typeof caches === "undefined") return [];
  const out: string[] = [];
  const names = await caches.keys();
  for (const name of names) {
    if (!name.startsWith("rokki-pages-")) continue;
    const c = await caches.open(name);
    const reqs = await c.keys();
    for (const req of reqs) {
      try {
        const u = new URL(req.url);
        if (u.origin !== location.origin) continue;
        // Skip the offline page itself.
        if (u.pathname === "/offline") continue;
        // Skip the asset/RSC sub-requests Next sometimes caches alongside.
        if (u.pathname.startsWith("/_next/")) continue;
        out.push(u.pathname + u.search);
      } catch {
        // ignore
      }
    }
  }
  // De-dup while preserving order.
  return Array.from(new Set(out)).slice(0, 30);
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
