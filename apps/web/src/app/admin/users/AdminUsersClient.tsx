"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  AdminBadge,
  AdminEmpty,
  AdminFilterInput,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";
import { CopyableId } from "@/components/CopyableId";
import { makeFuzzyFilter, useTableSort } from "@/lib/use-table-sort";

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
  const [tableFilter, setTableFilter] = useState("");
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

  const fuzzy = useMemo(
    () =>
      makeFuzzyFilter<Row>(tableFilter, (r) => [
        r.email,
        r.full_name,
        r.timezone,
        r.user_id,
      ]),
    [tableFilter],
  );

  const { sorted, onSortClick, arrow } = useTableSort<Row>({
    rows,
    filter: fuzzy,
    defaultSort: { key: "created_at", dir: "desc" },
    getValue: (r, key) => {
      switch (key) {
        case "email":
          return r.email;
        case "full_name":
          return r.full_name;
        case "timezone":
          return r.timezone;
        case "last_sign_in_at":
          return r.last_sign_in_at;
        case "status":
          return r.is_platform_admin
            ? "0-admin"
            : r.banned_until && new Date(r.banned_until) > new Date()
              ? "1-suspended"
              : "2-active";
        case "user_id":
          return r.user_id;
        case "created_at":
        default:
          return r.created_at;
      }
    },
  });

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
        <AdminFilterInput
          value={tableFilter}
          onChange={setTableFilter}
          placeholder="Filter visible rows…"
        />
        <span className="ml-auto text-xs text-text-3">
          {tableFilter ? `${sorted.length} / ${total}` : total}{" "}
          {total === 1 ? "user" : "users"}
        </span>
      </div>

      {error ? (
        <p className="rounded-sm border border-danger/40 bg-danger-subtle px-3 py-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}

      {loading && rows.length === 0 ? (
        <AdminEmpty>Loading…</AdminEmpty>
      ) : sorted.length === 0 ? (
        <AdminEmpty>No users match.</AdminEmpty>
      ) : (
        <AdminPanel>
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh sortKey="email" sortDir={arrow("email")} onSort={onSortClick}>
                  Email
                </AdminTh>
                <AdminTh
                  sortKey="full_name"
                  sortDir={arrow("full_name")}
                  onSort={onSortClick}
                >
                  Name
                </AdminTh>
                <AdminTh
                  sortKey="timezone"
                  sortDir={arrow("timezone")}
                  onSort={onSortClick}
                >
                  Timezone
                </AdminTh>
                <AdminTh
                  sortKey="last_sign_in_at"
                  sortDir={arrow("last_sign_in_at")}
                  onSort={onSortClick}
                >
                  Last seen
                </AdminTh>
                <AdminTh
                  sortKey="status"
                  sortDir={arrow("status")}
                  onSort={onSortClick}
                >
                  Status
                </AdminTh>
                <AdminTh
                  sortKey="user_id"
                  sortDir={arrow("user_id")}
                  onSort={onSortClick}
                >
                  ID
                </AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((u) => (
                <tr key={u.user_id} className="hover:bg-bg-2">
                  <AdminTd mono>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/admin/users/${u.user_id}`}
                        className="text-text-0 hover:text-accent"
                      >
                        {u.email}
                      </Link>
                      <CopyableId
                        value={u.email}
                        label="email"
                        display=""
                        className="px-0.5"
                      />
                    </div>
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
                    <CopyableId value={u.user_id} label="user id" truncate={8} />
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
