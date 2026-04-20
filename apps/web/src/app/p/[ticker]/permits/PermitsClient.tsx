"use client";

import { useState } from "react";
import { Plus, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PermitRow {
  id: string;
  number: string | null;
  kind: string;
  authority: string | null;
  status:
    | "applied"
    | "in_review"
    | "approved"
    | "issued"
    | "expired"
    | "denied";
  applied_on: string | null;
  issued_on: string | null;
  expires_on: string | null;
  notes: string | null;
  created_at: string;
}

const STATUSES: Array<PermitRow["status"]> = [
  "applied",
  "in_review",
  "approved",
  "issued",
  "expired",
  "denied",
];

export function PermitsClient({
  ticker,
  initial,
}: {
  ticker: string;
  initial: PermitRow[];
}) {
  const [rows, setRows] = useState<PermitRow[]>(initial);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState("");
  const [number, setNumber] = useState("");
  const [authority, setAuthority] = useState("");
  const [appliedOn, setAppliedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [status, setStatus] = useState<PermitRow["status"]>("applied");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/projects/${ticker}/permits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind,
          number: number || undefined,
          authority: authority || undefined,
          applied_on: appliedOn || undefined,
          expires_on: expiresOn || undefined,
          status,
        }),
      });
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(b.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      const b = (await r.json()) as { data: PermitRow };
      setRows((prev) => [b.data, ...prev]);
      setKind("");
      setNumber("");
      setAuthority("");
      setAppliedOn("");
      setExpiresOn("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-0">
          {rows.length} permit{rows.length === 1 ? "" : "s"}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent-subtle px-2.5 py-1 text-xs font-semibold uppercase text-accent hover:bg-accent/20"
        >
          <Plus className="h-3 w-3" /> {open ? "Cancel" : "New permit"}
        </button>
      </div>

      {open ? (
        <form
          onSubmit={add}
          className="mb-4 grid grid-cols-1 gap-2 rounded border border-border bg-bg-1 p-3 md:grid-cols-3"
        >
          <input
            required
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            placeholder="Kind (building, electrical…)"
            className="rounded-sm border border-border bg-bg-0 px-2 py-1 text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Permit number"
            className="rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <input
            value={authority}
            onChange={(e) => setAuthority(e.target.value)}
            placeholder="Authority / jurisdiction"
            className="rounded-sm border border-border bg-bg-0 px-2 py-1 text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <label className="flex items-center gap-2 text-xs">
            <span className="text-text-3">Applied</span>
            <input
              type="date"
              value={appliedOn}
              onChange={(e) => setAppliedOn(e.target.value)}
              className="flex-1 rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className="text-text-3">Expires</span>
            <input
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              className="flex-1 rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
            />
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PermitRow["status"])}
            className="rounded-sm border border-border bg-bg-2 px-2 py-1 font-mono text-sm uppercase text-text-1 outline-none focus:border-border-focus"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="md:col-span-3 flex items-center justify-end gap-2">
            {error ? (
              <span className="flex items-center gap-1 text-xs text-danger">
                <AlertCircle className="h-3 w-3" /> {error}
              </span>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent px-3 py-1 text-xs font-semibold uppercase text-bg-0 hover:bg-accent-hover",
                saving && "cursor-not-allowed opacity-60",
              )}
            >
              <Check className="h-3 w-3" /> {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-hidden rounded border border-border bg-bg-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
              <th className="px-3 py-2 text-left font-semibold">Kind</th>
              <th className="px-3 py-2 text-left font-semibold">Number</th>
              <th className="px-3 py-2 text-left font-semibold">Authority</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-left font-semibold">Applied</th>
              <th className="px-3 py-2 text-left font-semibold">Expires</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-xs text-text-3"
                >
                  No permits yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const expiringSoon =
                  r.expires_on &&
                  r.status === "issued" &&
                  new Date(r.expires_on).getTime() - Date.now() <
                    30 * 86_400_000;
                return (
                  <tr key={r.id} className="hover:bg-bg-2">
                    <td className="px-3 py-1.5 text-text-0">{r.kind}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-text-2">
                      {r.number ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-text-2">
                      {r.authority ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px] uppercase text-text-3">
                      {r.status}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-text-3">
                      {r.applied_on ?? ""}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-xs",
                        expiringSoon
                          ? "font-semibold text-warning"
                          : "text-text-3",
                      )}
                    >
                      {r.expires_on ?? ""}
                      {expiringSoon ? " (<30d)" : ""}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
