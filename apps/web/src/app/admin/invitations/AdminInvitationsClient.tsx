"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Mail, RotateCw, Trash2, Clock, AlertCircle, Check } from "lucide-react";
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
  email: string;
  role: string;
  invited_at: string;
  expires_at: string;
  accepted_at: string | null;
  space: { slug: string; name: string } | null;
  terminal: { ticker: string; name: string } | null;
}

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "expired", label: "Expired" },
  { id: "all", label: "All" },
];

export function AdminInvitationsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("pending");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/v1/admin/invitations?filter=${filter}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((b: { data?: Row[]; errors?: { message: string }[] }) => {
        if (b.errors?.[0]) {
          setError(b.errors[0].message);
          return;
        }
        setRows(b.data ?? []);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "load failed"),
      )
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(m: string) {
    setSuccess(m);
    setTimeout(() => setSuccess(null), 2500);
  }

  async function resend(id: string, email: string) {
    setBusy(id);
    try {
      const r = await fetch(
        `/api/v1/admin/invitations/${id}/resend`,
        { method: "POST", credentials: "include" },
      );
      if (!r.ok) {
        setError(await msg(r));
        return;
      }
      flash(`Resent to ${email}`);
    } finally {
      setBusy(null);
    }
  }

  async function extend(id: string, email: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/v1/admin/invitations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ extend_days: 14 }),
      });
      if (!r.ok) {
        setError(await msg(r));
        return;
      }
      flash(`Extended for ${email}`);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string, email: string) {
    if (!confirm(`Revoke the invite for ${email}?`)) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/v1/admin/invitations/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        setError(await msg(r));
        return;
      }
      flash(`Revoked invite for ${email}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-bg-1 p-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wide ${
                filter === f.id
                  ? "border-accent bg-accent-subtle text-accent"
                  : "border-border bg-bg-2 text-text-2 hover:bg-bg-3"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-text-3">
          {rows.length} {rows.length === 1 ? "invite" : "invites"}
        </span>
      </div>

      {error ? (
        <p className="flex items-center gap-1 rounded-sm border border-danger/40 bg-danger-subtle px-3 py-1.5 text-xs text-danger">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      ) : null}
      {success ? (
        <p className="flex items-center gap-1 rounded-sm border border-success/40 bg-success-subtle px-3 py-1.5 text-xs text-success">
          <Check className="h-3 w-3" /> {success}
        </p>
      ) : null}

      {loading && rows.length === 0 ? (
        <AdminEmpty>Loading…</AdminEmpty>
      ) : rows.length === 0 ? (
        <AdminEmpty>No {filter} invitations.</AdminEmpty>
      ) : (
        <AdminPanel>
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Email</AdminTh>
                <AdminTh>Role</AdminTh>
                <AdminTh>Scope</AdminTh>
                <AdminTh>Invited</AdminTh>
                <AdminTh>Expires</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const expired = new Date(r.expires_at) < new Date();
                return (
                  <tr key={r.id}>
                    <AdminTd mono>
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3 w-3 text-text-3" />
                        {r.email}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      <AdminBadge>{r.role}</AdminBadge>
                    </AdminTd>
                    <AdminTd>
                      {r.terminal ? (
                        <Link
                          href={`/admin/terminals/${r.terminal.ticker}`}
                          className="text-accent hover:underline"
                        >
                          {r.terminal.ticker}
                        </Link>
                      ) : r.space ? (
                        <Link
                          href={`/admin/spaces/${r.space.slug}`}
                          className="text-accent hover:underline"
                        >
                          /{r.space.slug}
                        </Link>
                      ) : (
                        <span className="text-text-3">—</span>
                      )}
                    </AdminTd>
                    <AdminTd>
                      <span className="text-xs text-text-3">
                        {new Date(r.invited_at).toLocaleString()}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      <span
                        className={`text-xs ${
                          expired ? "font-semibold text-danger" : "text-text-3"
                        }`}
                      >
                        {new Date(r.expires_at).toLocaleString()}
                      </span>
                    </AdminTd>
                    <AdminTd align="right">
                      <div className="flex justify-end gap-1">
                        <AdminButton
                          onClick={() => void resend(r.id, r.email)}
                          disabled={busy === r.id}
                        >
                          <RotateCw className="h-3 w-3" /> Resend
                        </AdminButton>
                        <AdminButton
                          onClick={() => void extend(r.id, r.email)}
                          disabled={busy === r.id}
                        >
                          <Clock className="h-3 w-3" /> +14d
                        </AdminButton>
                        <AdminButton
                          variant="danger"
                          onClick={() => void revoke(r.id, r.email)}
                          disabled={busy === r.id}
                        >
                          <Trash2 className="h-3 w-3" /> Revoke
                        </AdminButton>
                      </div>
                    </AdminTd>
                  </tr>
                );
              })}
            </tbody>
          </AdminTable>
        </AdminPanel>
      )}
    </>
  );
}

async function msg(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { errors?: { message: string }[] };
    return body.errors?.[0]?.message ?? `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}
