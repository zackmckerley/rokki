"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Check, X, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Approval {
  id: string;
  type: string;
  requester_id: string;
  subject_id: string;
  context: Record<string, unknown>;
  requested_at: string;
  expires_at: string;
}

interface BulkResultItem {
  id: string;
  status: "approved" | "denied" | "skipped" | "error";
  reason?: string;
}

export function ApprovalsClient({ scope }: { scope: "mine" | "inbox" }) {
  const [rows, setRows] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState<"approved" | "denied" | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/v1/approvals?scope=${scope}`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: { data?: Approval[] }) => {
        setRows(b.data ?? []);
        // Drop any selections that no longer correspond to a row.
        setSelected((prev) => {
          const ids = new Set((b.data ?? []).map((a) => a.id));
          const next = new Set<string>();
          for (const id of prev) if (ids.has(id)) next.add(id);
          return next;
        });
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "failed to load"),
      );
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  // When the inbox/outbox toggle flips, drop the selection — the rows
  // changed meaning out from under us.
  useEffect(() => {
    setSelected(new Set());
    setReason("");
  }, [scope]);

  function flashFor(ms: number, msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), ms);
  }

  async function resolve(id: string, status: "approved" | "denied") {
    setBusy(id);
    setError(null);
    try {
      const r = await fetch(`/api/v1/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      setRows((prev) => (prev ?? []).filter((a) => a.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } finally {
      setBusy(null);
    }
  }

  async function resolveBulk(decision: "approved" | "denied") {
    if (selected.size === 0) return;
    setBulkBusy(decision);
    setError(null);
    try {
      const ids = Array.from(selected);
      const r = await fetch("/api/v1/approvals/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ids,
          decision,
          note: reason.trim() || null,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as {
        data?: {
          decision: "approved" | "denied";
          resolved: number;
          skipped: number;
          results: BulkResultItem[];
        };
        errors?: { message: string }[];
      };
      if (!r.ok || !body.data) {
        setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      const resolvedIds = new Set(
        body.data.results
          .filter((it) => it.status === decision)
          .map((it) => it.id),
      );
      setRows((prev) => (prev ?? []).filter((a) => !resolvedIds.has(a.id)));
      setSelected(new Set());
      setReason("");
      flashFor(
        3000,
        body.data.skipped > 0
          ? `${body.data.resolved} ${decision} · ${body.data.skipped} skipped`
          : `${body.data.resolved} ${decision}`,
      );
    } finally {
      setBulkBusy(null);
    }
  }

  const allSelected = useMemo(
    () => (rows?.length ?? 0) > 0 && (rows?.every((a) => selected.has(a.id)) ?? false),
    [rows, selected],
  );
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set((rows ?? []).map((a) => a.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows === null)
    return <p className="text-xs text-text-3">Loading…</p>;
  if (rows.length === 0)
    return (
      <p className="rounded border border-dashed border-border bg-bg-1 p-10 text-center text-sm text-text-3">
        {scope === "inbox"
          ? "No pending approvals. You're clear."
          : "You haven't requested anything."}
      </p>
    );

  const isInbox = scope === "inbox";

  return (
    <>
      {error ? (
        <p className="mb-3 flex items-center gap-1.5 rounded-sm border border-danger/40 bg-danger-subtle px-3 py-1.5 text-xs text-danger">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      ) : null}
      {flash ? (
        <p className="mb-3 flex items-center gap-1.5 rounded-sm border border-success/40 bg-success-subtle px-3 py-1.5 text-xs text-success">
          <Check className="h-3 w-3" /> {flash}
        </p>
      ) : null}
      {isInbox ? (
        <header className="mb-2 flex items-center gap-2 rounded border border-border bg-bg-1 px-3 py-1.5 text-xs text-text-3">
          <input
            type="checkbox"
            aria-label={allSelected ? "Deselect all" : "Select all"}
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleAll}
            className="h-3.5 w-3.5 cursor-pointer accent-accent"
          />
          <span>
            {selected.size > 0
              ? `${selected.size} of ${rows.length} selected`
              : `${rows.length} pending`}
          </span>
        </header>
      ) : null}
      <ul className={cn("flex flex-col gap-2", isInbox && selected.size > 0 && "pb-32")}>
        {rows.map((a) => (
          <li
            key={a.id}
            className={cn(
              "flex items-start gap-3 rounded border bg-bg-1 p-3",
              selected.has(a.id) ? "border-accent" : "border-border",
            )}
          >
            {isInbox ? (
              <input
                type="checkbox"
                aria-label={`Select ${labelOf(a)}`}
                checked={selected.has(a.id)}
                onChange={() => toggleOne(a.id)}
                className="mt-1 h-3.5 w-3.5 cursor-pointer accent-accent"
              />
            ) : null}
            <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-0">
                {labelOf(a)}
              </p>
              <p className="mt-0.5 truncate text-xs text-text-3">
                Input:{" "}
                <code className="font-mono">
                  {(a.context?.input_hint as string) ?? "(none)"}
                </code>
              </p>
              <p className="mt-0.5 text-[11px] text-text-3">
                Requested {relativeTime(a.requested_at)} · expires{" "}
                {relativeTime(a.expires_at)}
              </p>
            </div>
            {isInbox ? (
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void resolve(a.id, "approved")}
                  disabled={busy === a.id || bulkBusy != null}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-sm border border-success/40 bg-success-subtle px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-success hover:bg-success/20",
                    (busy === a.id || bulkBusy != null) &&
                      "cursor-not-allowed opacity-50",
                  )}
                >
                  <Check className="h-3 w-3" /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => void resolve(a.id, "denied")}
                  disabled={busy === a.id || bulkBusy != null}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-sm border border-danger/40 bg-danger-subtle px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-danger hover:bg-danger/20",
                    (busy === a.id || bulkBusy != null) &&
                      "cursor-not-allowed opacity-50",
                  )}
                >
                  <X className="h-3 w-3" /> Deny
                </button>
              </div>
            ) : (
              <span className="font-mono text-[10px] uppercase text-text-3">
                pending
              </span>
            )}
          </li>
        ))}
      </ul>

      {isInbox && selected.size > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-bg-0/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-bg-0/80">
          <div className="mx-auto flex max-w-4xl flex-wrap items-end gap-2">
            <span className="font-mono text-xs uppercase tracking-wide text-text-3">
              {selected.size} selected
            </span>
            <label className="flex flex-1 min-w-[240px] flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-text-3">
                Reason (optional, ≤ 1000 chars)
              </span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                placeholder="Visible in the audit log"
                className="rounded-sm border border-border bg-bg-2 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
              />
            </label>
            <button
              type="button"
              onClick={() => void resolveBulk("approved")}
              disabled={bulkBusy != null}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border border-success/40 bg-success-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-success hover:bg-success/20",
                bulkBusy != null && "cursor-not-allowed opacity-50",
              )}
            >
              <Check className="h-3 w-3" />
              Approve {selected.size}
            </button>
            <button
              type="button"
              onClick={() => void resolveBulk("denied")}
              disabled={bulkBusy != null}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border border-danger/40 bg-danger-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-danger hover:bg-danger/20",
                bulkBusy != null && "cursor-not-allowed opacity-50",
              )}
            >
              <X className="h-3 w-3" />
              Deny {selected.size}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelected(new Set());
                setReason("");
              }}
              disabled={bulkBusy != null}
              className="inline-flex items-center rounded-sm border border-transparent px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-2 hover:bg-bg-2 hover:text-text-0"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function labelOf(a: Approval): string {
  const toolName = (a.context?.tool_name as string) ?? "a tool";
  if (a.type === "tool_access") return `Requesting access to ${toolName}`;
  if (a.type === "tool_invocation") return `Approve one run of ${toolName}`;
  if (a.type === "tool_publish") return `Tool publish: ${toolName}`;
  return `${a.type} request`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const suffix = diff > 0 ? "ago" : "from now";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ${suffix}`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ${suffix}`;
  const days = Math.round(hrs / 24);
  return `${days}d ${suffix}`;
}
