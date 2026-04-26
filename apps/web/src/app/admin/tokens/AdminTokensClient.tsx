"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Trash2, AlertCircle, Check } from "lucide-react";
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
  name: string;
  token_prefix: string;
  scopes: string[];
  user_id: string;
  email: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "0", label: "All" },
  { id: "30", label: "Stale 30d+" },
  { id: "90", label: "Stale 90d+" },
];

export function AdminTokensClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filter !== "0") params.set("stale_days", filter);
    fetch(`/api/v1/admin/tokens?${params.toString()}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((b: { data?: Row[] }) => setRows(b.data ?? []))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "load failed"),
      );
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(m: string) {
    setSuccess(m);
    setTimeout(() => setSuccess(null), 2500);
  }

  async function revoke(id: string, name: string) {
    if (!confirm(`Revoke token "${name}"? Sessions using it end immediately.`))
      return;
    setBusy(id);
    try {
      const r = await fetch(`/api/v1/admin/tokens?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        setError(await msg(r));
        return;
      }
      flash("Revoked");
      load();
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
          {rows.length} {rows.length === 1 ? "token" : "tokens"}
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

      {rows.length === 0 ? (
        <AdminEmpty
          panel
          body="API tokens issued via /settings/tokens by any user appear here."
        >
          No tokens match.
        </AdminEmpty>
      ) : (
        <AdminPanel>
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Name</AdminTh>
                <AdminTh>Owner</AdminTh>
                <AdminTh>Prefix</AdminTh>
                <AdminTh>Scopes</AdminTh>
                <AdminTh>Created</AdminTh>
                <AdminTh>Last used</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh align="right">Actions</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => {
                const stale =
                  !t.last_used_at ||
                  Date.now() - new Date(t.last_used_at).getTime() >
                    90 * 86_400_000;
                return (
                  <tr key={t.id}>
                    <AdminTd>{t.name}</AdminTd>
                    <AdminTd mono>
                      <Link
                        href={`/admin/users/${t.user_id}`}
                        className="text-text-1 hover:text-accent"
                      >
                        {t.email || t.user_id.slice(0, 8)}
                      </Link>
                    </AdminTd>
                    <AdminTd mono>{t.token_prefix}…</AdminTd>
                    <AdminTd mono>{(t.scopes ?? []).join(", ")}</AdminTd>
                    <AdminTd>
                      <span className="text-xs text-text-3">
                        {new Date(t.created_at).toLocaleDateString()}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      <span className="text-xs text-text-3">
                        {t.last_used_at
                          ? new Date(t.last_used_at).toLocaleString()
                          : "never"}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      {t.revoked_at ? (
                        <AdminBadge variant="danger">revoked</AdminBadge>
                      ) : t.expires_at && new Date(t.expires_at) < new Date() ? (
                        <AdminBadge variant="warning">expired</AdminBadge>
                      ) : stale ? (
                        <AdminBadge variant="warning">stale</AdminBadge>
                      ) : (
                        <AdminBadge variant="success">active</AdminBadge>
                      )}
                    </AdminTd>
                    <AdminTd align="right">
                      {!t.revoked_at ? (
                        <AdminButton
                          variant="danger"
                          onClick={() => void revoke(t.id, t.name)}
                          disabled={busy === t.id}
                        >
                          <Trash2 className="h-3 w-3" /> Revoke
                        </AdminButton>
                      ) : null}
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
