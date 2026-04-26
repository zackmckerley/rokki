"use client";

import { useEffect, useState, useCallback } from "react";
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

export function ApprovalsClient({ scope }: { scope: "mine" | "inbox" }) {
  const [rows, setRows] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/v1/approvals?scope=${scope}`, { credentials: "include" })
      .then((r) => r.json())
      .then((b: { data?: Approval[] }) => setRows(b.data ?? []))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "failed to load"),
      );
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

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
    } finally {
      setBusy(null);
    }
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

  return (
    <>
      {error ? (
        <p className="mb-3 flex items-center gap-1.5 rounded-sm border border-danger/40 bg-danger-subtle px-3 py-1.5 text-xs text-danger">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {rows.map((a) => (
          <li
            key={a.id}
            className="flex items-start gap-3 rounded border border-border bg-bg-1 p-3"
          >
            <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
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
            {scope === "inbox" ? (
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void resolve(a.id, "approved")}
                  disabled={busy === a.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-sm border border-success/40 bg-success-subtle px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-success hover:bg-success/20",
                    busy === a.id && "cursor-not-allowed opacity-50",
                  )}
                >
                  <Check className="h-3 w-3" /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => void resolve(a.id, "denied")}
                  disabled={busy === a.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-sm border border-danger/40 bg-danger-subtle px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-danger hover:bg-danger/20",
                    busy === a.id && "cursor-not-allowed opacity-50",
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
