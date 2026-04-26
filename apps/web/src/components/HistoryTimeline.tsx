"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { ActivityDiff } from "@/components/ActivityDiff";
import { cn } from "@/lib/utils";

export interface HistoryRow {
  id: string;
  action: string;
  actor_id: string | null;
  created_at: string;
  before_json: unknown;
  after_json: unknown;
  metadata?: Record<string, unknown> | null;
}

interface HistoryTimelineProps {
  /** "task" | "terminal" | "space" | "file" | "comment" — drives /api fetch */
  entityType: "task" | "terminal" | "space" | "file" | "comment";
  entityId: string;
  /** Map of user_id → display name; falls back to a short uuid. */
  actorNames?: Record<string, string>;
  /** Optional pre-fetched rows to skip the network round-trip. */
  initialRows?: HistoryRow[];
  /** Cap. Default 50. */
  limit?: number;
}

/**
 * Reverse-chronological audit timeline for a single record.
 *
 * Fetches `/api/v1/admin/history?entity_type=…&entity_id=…` (RLS-scoped:
 * the endpoint reads from `activity` directly which already restricts
 * visibility to people who can see the parent terminal/space).
 *
 * Each row collapses to a one-line summary; clicking expands to the full
 * `<ActivityDiff />` with red/green per-field detail.
 */
export function HistoryTimeline({
  entityType,
  entityId,
  actorNames = {},
  initialRows,
  limit = 50,
}: HistoryTimelineProps) {
  const [rows, setRows] = useState<HistoryRow[] | null>(initialRows ?? null);
  const [loading, setLoading] = useState(initialRows == null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRows) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/v1/history?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}&limit=${limit}`;
        const r = await fetch(url, { credentials: "include" });
        if (!r.ok) {
          setError(`history fetch failed (${r.status})`);
          return;
        }
        const body = (await r.json()) as { data: HistoryRow[] };
        if (!cancelled) setRows(body.data);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "history fetch failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, initialRows, limit]);

  if (loading) {
    return <p className="text-[11px] text-text-3">Loading history…</p>;
  }
  if (error) {
    return <p className="text-[11px] text-danger">{error}</p>;
  }
  if (!rows || rows.length === 0) {
    return (
      <p className="text-[11px] text-text-3">
        No history yet — every change to this record will appear here with a
        before/after diff.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {rows.map((row) => (
        <HistoryItem key={row.id} row={row} actorNames={actorNames} />
      ))}
    </ol>
  );
}

function HistoryItem({
  row,
  actorNames,
}: {
  row: HistoryRow;
  actorNames: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const actor = row.actor_id
    ? actorNames[row.actor_id] ?? `${row.actor_id.slice(0, 8)}`
    : "system";
  const expandable =
    row.before_json != null || row.after_json != null;
  return (
    <li className="rounded border border-border bg-bg-1">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-[11px]",
          expandable
            ? "cursor-pointer hover:bg-bg-2"
            : "cursor-default opacity-90",
        )}
      >
        {expandable ? (
          open ? (
            <ChevronDown className="mt-0.5 h-3 w-3 flex-shrink-0 text-text-3" />
          ) : (
            <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-text-3" />
          )
        ) : (
          <History className="mt-0.5 h-3 w-3 flex-shrink-0 text-text-3" />
        )}
        <span className="font-mono text-[10px] text-text-3">
          {formatTime(row.created_at)}
        </span>
        <span className="font-mono text-[11px] text-accent">{row.action}</span>
        <span className="text-text-3">·</span>
        <span className="text-text-2">{actor}</span>
      </button>
      {open && expandable ? (
        <div className="border-t border-border bg-bg-0 px-3 py-2">
          <ActivityDiff before={row.before_json} after={row.after_json} />
        </div>
      ) : null}
    </li>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}
