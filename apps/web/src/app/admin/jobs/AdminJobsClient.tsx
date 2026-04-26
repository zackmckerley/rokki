"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Play, RotateCcw } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";

interface Row {
  id: string;
  queue: string;
  payload: unknown;
  status: "pending" | "running" | "done" | "failed" | "dead";
  attempt: number;
  max_attempts: number;
  next_run_at: string;
  last_error: string | null;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ListResponse {
  data: Row[];
  meta?: {
    counts: Record<string, number>;
    queues: string[];
  };
}

const STATUSES: Row["status"][] = [
  "pending",
  "running",
  "done",
  "failed",
  "dead",
];

const STATUS_VARIANT: Record<Row["status"], "muted" | "accent" | "success" | "warning" | "danger"> = {
  pending: "muted",
  running: "accent",
  done: "success",
  failed: "warning",
  dead: "danger",
};

export function AdminJobsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [queues, setQueues] = useState<string[]>([]);
  const [queueFilter, setQueueFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (queueFilter) params.set("queue", queueFilter);
    if (statusFilter) params.set("status", statusFilter);
    params.set("limit", "200");
    fetch(`/api/v1/admin/jobs?${params.toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: ListResponse) => {
        setRows(b.data ?? []);
        setCounts(b.meta?.counts ?? {});
        setQueues(b.meta?.queues ?? []);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "load failed"),
      );
  }, [queueFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 2500);
  }

  async function replay(id: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/v1/admin/jobs/${id}/replay`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        setError(await readError(r));
        return;
      }
      flash("Job re-queued");
      load();
    } finally {
      setBusy(null);
    }
  }

  async function processNow() {
    setProcessing(true);
    try {
      const params = queueFilter ? { queue: queueFilter } : {};
      const r = await fetch("/api/v1/admin/jobs/process", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!r.ok) {
        setError(await readError(r));
        return;
      }
      const body = (await r.json()) as {
        data: { processed: number; failed: number; dead: number };
      };
      flash(
        `Processed ${body.data.processed}, failed ${body.data.failed}, dead ${body.data.dead}`,
      );
      load();
    } finally {
      setProcessing(false);
    }
  }

  const filteredRows = useMemo(() => rows, [rows]);

  return (
    <div className="flex flex-col gap-4">
      {/* Counts strip */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            className={`flex items-center justify-between rounded border px-3 py-2 text-left ${
              statusFilter === s
                ? "border-accent bg-accent-subtle/30"
                : "border-border bg-bg-1 hover:bg-bg-2"
            }`}
          >
            <span className="text-[10px] uppercase tracking-wide text-text-3">
              {s}
            </span>
            <span className="font-mono text-lg tabular-nums text-text-0">
              {counts[s] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Filters + actions */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Queue
          </span>
          <select
            value={queueFilter}
            onChange={(e) => setQueueFilter(e.target.value)}
            className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-xs text-text-0 outline-none focus:border-border-focus"
          >
            <option value="">all queues</option>
            {queues.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Status
          </span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-xs text-text-0 outline-none focus:border-border-focus"
          >
            <option value="">any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex gap-2">
          <AdminButton onClick={load}>
            <RotateCcw className="h-3 w-3" /> Refresh
          </AdminButton>
          <AdminButton
            variant="accent"
            onClick={() => void processNow()}
            disabled={processing}
          >
            <Play className="h-3 w-3" /> {processing ? "Processing…" : "Process now"}
          </AdminButton>
        </div>
      </div>

      {error ? (
        <p className="flex items-center gap-1 rounded-sm border border-danger/40 bg-danger-subtle px-3 py-1.5 text-xs text-danger">
          <AlertCircle className="h-3 w-3" /> {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-[10px] uppercase tracking-wide text-text-3 hover:text-text-0"
          >
            dismiss
          </button>
        </p>
      ) : null}
      {success ? (
        <p className="flex items-center gap-1 rounded-sm border border-success/40 bg-success-subtle px-3 py-1.5 text-xs text-success">
          <Check className="h-3 w-3" /> {success}
        </p>
      ) : null}

      {filteredRows.length === 0 ? (
        <AdminEmpty>No jobs match this filter.</AdminEmpty>
      ) : (
        <AdminPanel>
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Queue</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Attempt</AdminTh>
                <AdminTh>Next run</AdminTh>
                <AdminTh>Created</AdminTh>
                <AdminTh>Last error / payload</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((j) => (
                <tr key={j.id}>
                  <AdminTd mono>{j.queue}</AdminTd>
                  <AdminTd>
                    <AdminBadge variant={STATUS_VARIANT[j.status]}>
                      {j.status}
                    </AdminBadge>
                  </AdminTd>
                  <AdminTd mono>
                    {j.attempt}/{j.max_attempts}
                  </AdminTd>
                  <AdminTd mono>{relativeTime(j.next_run_at)}</AdminTd>
                  <AdminTd mono>{relativeTime(j.created_at)}</AdminTd>
                  <AdminTd>
                    <span className="block max-w-md truncate font-mono text-[11px] text-text-2">
                      {j.last_error ?? summarizePayload(j.payload)}
                    </span>
                  </AdminTd>
                  <AdminTd align="right">
                    {j.status === "dead" ? (
                      <AdminButton
                        variant="accent"
                        onClick={() => void replay(j.id)}
                        disabled={busy === j.id}
                      >
                        <RotateCcw className="h-3 w-3" /> Replay
                      </AdminButton>
                    ) : (
                      <span className="text-[10px] text-text-3">—</span>
                    )}
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </AdminPanel>
      )}
    </div>
  );
}

function summarizePayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  try {
    const s = JSON.stringify(payload);
    return s.length > 120 ? s.slice(0, 120) + "…" : s;
  } catch {
    return "";
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const sign = diff < 0 ? "in " : "";
  const suffix = diff < 0 ? "" : " ago";
  if (mins < 1) return "just now";
  if (mins < 60) return `${sign}${mins}m${suffix}`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${sign}${hrs}h${suffix}`;
  const days = Math.round(hrs / 24);
  return `${sign}${days}d${suffix}`;
}

async function readError(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { errors?: { message: string }[] };
    return body.errors?.[0]?.message ?? `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}
