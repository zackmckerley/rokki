"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  AdminBadge,
  AdminCopyButton,
  AdminEmpty,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";

interface Row {
  user_id: string;
  email: string;
  full_name: string | null;
  timezone: string | null;
  is_platform_admin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
}

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "", label: "All" },
  { id: "active", label: "Active" },
  { id: "suspended", label: "Suspended" },
  { id: "admins", label: "Platform admins" },
];

export function AdminUsersClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filter) params.set("filter", filter);
    fetch(`/api/v1/admin/users?${params.toString()}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then(
        (body: {
          data?: Row[];
          meta?: { total?: number };
          errors?: { message: string }[];
        }) => {
          if (body.errors?.[0]) {
            setError(body.errors[0].message);
            return;
          }
          setRows(body.data ?? []);
          setTotal(body.meta?.total ?? 0);
        },
      )
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "load failed"),
      )
      .finally(() => setLoading(false));
  }, [q, filter]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-bg-1 p-2">
        <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-sm border border-border bg-bg-0 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-text-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email or name…"
            className="flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
          />
        </div>
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
          {total} {total === 1 ? "user" : "users"}
        </span>
      </div>

      {error ? (
        <p className="rounded-sm border border-danger/40 bg-danger-subtle px-3 py-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}

      {loading && rows.length === 0 ? (
        <AdminEmpty panel>Loading…</AdminEmpty>
      ) : rows.length === 0 ? (
        <AdminEmpty
          panel
          body={
            q || filter
              ? "Try clearing the filter or search."
              : "Create the first user to get started."
          }
          action={
            !q && !filter
              ? {
                  label: "+ New user",
                  href: "/admin/users/new",
                  variant: "accent",
                }
              : undefined
          }
        >
          {q || filter ? "No users match." : "No users yet."}
        </AdminEmpty>
      ) : (
        <AdminPanel>
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Email</AdminTh>
                <AdminTh>Name</AdminTh>
                <AdminTh>Timezone</AdminTh>
                <AdminTh>Last seen</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>ID</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((u) => (
                <tr key={u.user_id} className="hover:bg-bg-2">
                  <AdminTd mono>
                    <Link
                      href={`/admin/users/${u.user_id}`}
                      className="text-text-0 hover:text-accent"
                    >
                      {u.email}
                    </Link>
                  </AdminTd>
                  <AdminTd>{u.full_name ?? "—"}</AdminTd>
                  <AdminTd>{u.timezone ?? "—"}</AdminTd>
                  <AdminTd>
                    <span className="text-xs text-text-3">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleString()
                        : "never"}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    <div className="flex gap-1">
                      {u.is_platform_admin ? (
                        <AdminBadge variant="accent">admin</AdminBadge>
                      ) : null}
                      {u.banned_until && new Date(u.banned_until) > new Date() ? (
                        <AdminBadge variant="danger">suspended</AdminBadge>
                      ) : (
                        <AdminBadge variant="muted">active</AdminBadge>
                      )}
                    </div>
                  </AdminTd>
                  <AdminTd>
                    <div className="flex items-center gap-1 text-[10px] text-text-3">
                      <span className="font-mono">
                        {u.user_id.slice(0, 8)}
                      </span>
                      <AdminCopyButton value={u.user_id} />
                    </div>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </AdminPanel>
      )}
    </>
  );
}
