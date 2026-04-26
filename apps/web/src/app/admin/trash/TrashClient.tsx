"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RotateCcw,
  Trash2,
  RefreshCw,
  Filter,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TrashEntry {
  kind: "tasks" | "terminals" | "spaces" | "files" | "comments";
  id: string;
  label: string;
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_name: string | null;
  context: string | null;
}

interface PurgeResult {
  cutoff_days: number;
  total: number;
  by_table: Array<{ table_name: string; purged: number }>;
}

const KINDS = ["all", "tasks", "terminals", "spaces", "files", "comments"] as const;
type Kind = (typeof KINDS)[number];

export function TrashClient() {
  const [kind, setKind] = useState<Kind>("all");
  const [rows, setRows] = useState<TrashEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<PurgeResult | null>(null);
  const [cutoffDays, setCutoffDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/admin/trash?kind=${kind}&limit=200`, {
        credentials: "include",
      });
      if (!r.ok) {
        setError(`Trash fetch failed (${r.status})`);
        return;
      }
      const body = (await r.json()) as { data: TrashEntry[] };
      setRows(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trash fetch failed");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = useCallback(
    async (entry: TrashEntry) => {
      setBusyId(entry.id);
      try {
        const r = await fetch(`/api/v1/admin/trash/${entry.kind}/${entry.id}`, {
          method: "POST",
          credentials: "include",
        });
        if (!r.ok) {
          setError(`Restore failed (${r.status})`);
          return;
        }
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const permanent = useCallback(
    async (entry: TrashEntry) => {
      const ok = window.confirm(
        `Permanently delete this ${entry.kind.replace(/s$/, "")}?\n\n` +
          `${entry.label}\n\n` +
          "This cannot be undone.",
      );
      if (!ok) return;
      setBusyId(entry.id);
      try {
        const r = await fetch(`/api/v1/admin/trash/${entry.kind}/${entry.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!r.ok) {
          setError(`Permanent delete failed (${r.status})`);
          return;
        }
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const runPurge = useCallback(async () => {
    const ok = window.confirm(
      `Hard-delete every soft-deleted row older than ${cutoffDays} days across the platform?\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    setPurging(true);
    setError(null);
    setPurgeResult(null);
    try {
      const r = await fetch("/api/v1/admin/trash/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cutoff_days: cutoffDays }),
      });
      if (!r.ok) {
        setError(`Purge failed (${r.status})`);
        return;
      }
      const body = (await r.json()) as { data: PurgeResult };
      setPurgeResult(body.data);
      await load();
    } finally {
      setPurging(false);
    }
  }, [cutoffDays, load]);

  const grouped = useMemo(() => {
    const out = new Map<TrashEntry["kind"], TrashEntry[]>();
    for (const r of rows ?? []) {
      const list = out.get(r.kind) ?? [];
      list.push(r);
      out.set(r.kind, list);
    }
    return out;
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded border border-border bg-bg-1 p-3">
        <div className="flex items-center gap-2 text-xs text-text-3">
          <Filter className="h-3.5 w-3.5" />
          <span className="font-mono uppercase tracking-wider">Filter</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="rounded-sm border border-border bg-bg-2 px-2 py-1 text-[11px] text-text-0 outline-none focus:border-border-focus"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-2 px-2 py-1 text-[11px] text-text-1 hover:bg-bg-3"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          Refresh
        </button>
        <div className="ml-auto flex items-center gap-2 text-xs text-text-3">
          <span className="font-mono uppercase tracking-wider">Auto-purge cutoff</span>
          <input
            type="number"
            min={1}
            max={365}
            value={cutoffDays}
            onChange={(e) =>
              setCutoffDays(Math.min(Math.max(Number(e.target.value) || 30, 1), 365))
            }
            className="w-16 rounded-sm border border-border bg-bg-2 px-2 py-1 text-[11px] text-text-0 outline-none focus:border-border-focus"
          />
          <span className="text-text-3">days</span>
          <button
            type="button"
            onClick={() => void runPurge()}
            disabled={purging}
            className="inline-flex items-center gap-1 rounded-sm border border-danger/40 bg-danger-subtle px-2 py-1 text-[11px] font-semibold text-danger hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Sparkles className="h-3 w-3" />
            Run purge
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded border border-danger/40 bg-danger-subtle px-3 py-2 text-xs text-danger">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </div>
      ) : null}

      {purgeResult ? (
        <div className="rounded border border-border bg-bg-1 px-3 py-2 text-xs text-text-2">
          <div className="font-semibold text-text-0">
            Purged {purgeResult.total} row{purgeResult.total === 1 ? "" : "s"}{" "}
            older than {purgeResult.cutoff_days} days.
          </div>
          {purgeResult.by_table.length > 0 ? (
            <ul className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-text-3">
              {purgeResult.by_table
                .filter((r) => Number(r.purged) > 0)
                .map((r) => (
                  <li key={r.table_name}>
                    {r.table_name}: {Number(r.purged)}
                  </li>
                ))}
              {purgeResult.by_table.every((r) => Number(r.purged) === 0) ? (
                <li>(nothing to purge)</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Listing */}
      {loading && !rows ? (
        <p className="text-xs text-text-3">Loading trash…</p>
      ) : (rows?.length ?? 0) === 0 ? (
        <div className="rounded border border-dashed border-border bg-bg-1 px-4 py-10 text-center text-xs text-text-3">
          The trash is empty. Anything that gets soft-deleted across the
          platform will appear here, grouped by kind.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {([...grouped.entries()] as Array<[TrashEntry["kind"], TrashEntry[]]>).map(
            ([k, list]) => (
              <KindSection
                key={k}
                kind={k}
                entries={list}
                busyId={busyId}
                onRestore={restore}
                onPermanent={permanent}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function KindSection({
  kind,
  entries,
  busyId,
  onRestore,
  onPermanent,
}: {
  kind: TrashEntry["kind"];
  entries: TrashEntry[];
  busyId: string | null;
  onRestore: (e: TrashEntry) => void;
  onPermanent: (e: TrashEntry) => void;
}) {
  return (
    <section className="rounded border border-border bg-bg-1">
      <header className="flex items-center justify-between border-b border-border bg-bg-2 px-3 py-1.5">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-2">
          {kind}
        </h2>
        <span className="text-[10px] text-text-3">{entries.length} row{entries.length === 1 ? "" : "s"}</span>
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wide text-text-3">
            <th className="px-3 py-2 text-left font-semibold">Label</th>
            <th className="px-3 py-2 text-left font-semibold">Context</th>
            <th className="px-3 py-2 text-left font-semibold">Deleted</th>
            <th className="px-3 py-2 text-left font-semibold">By</th>
            <th className="px-3 py-2 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => {
            const busy = busyId === entry.id;
            return (
              <tr key={entry.id}>
                <td className="px-3 py-1.5 text-xs text-text-1">
                  <span className="block max-w-md truncate" title={entry.label}>
                    {entry.label || <em className="text-text-3">(no label)</em>}
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-text-3">
                  {entry.context ?? "—"}
                </td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-text-3">
                  {new Date(entry.deleted_at).toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-[11px] text-text-2">
                  {entry.deleted_by_name ??
                    (entry.deleted_by ? entry.deleted_by.slice(0, 8) : "—")}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onRestore(entry)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-2 px-2 py-1 text-[11px] text-text-1 hover:bg-bg-3 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => onPermanent(entry)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-sm border border-danger/40 bg-danger-subtle px-2 py-1 text-[11px] text-danger hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
