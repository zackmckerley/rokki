"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  AdminBadge,
  AdminEmpty,
  AdminMobileCard,
  AdminMobileField,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";

interface Row {
  space_id: string;
  slug: string;
  name: string;
  description: string | null;
  archived_at: string | null;
  created_at: string;
}

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "active", label: "Active" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

export function AdminSpacesClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("active");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filter !== "all") params.set("filter", filter);
    fetch(`/api/v1/admin/spaces?${params.toString()}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then(
        (b: { data?: Row[]; errors?: { message: string }[] }) => {
          if (b.errors?.[0]) {
            setError(b.errors[0].message);
            return;
          }
          setRows(b.data ?? []);
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
            placeholder="Search by name or slug…"
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
          {rows.length} {rows.length === 1 ? "space" : "spaces"}
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
            q
              ? "Try a different search term."
              : "Spaces are tenants — companies, families, or households."
          }
          action={
            !q
              ? {
                  label: "+ New space",
                  href: "/admin/spaces/new",
                  variant: "accent",
                }
              : undefined
          }
        >
          {q ? "No spaces match." : "No spaces yet."}
        </AdminEmpty>
      ) : (
        <>
          <div className="hidden sm:block">
            <AdminPanel>
              <AdminTable className="border-0">
                <thead>
                  <tr className="border-b border-border bg-bg-2">
                    <AdminTh>Name</AdminTh>
                    <AdminTh>Slug</AdminTh>
                    <AdminTh>Status</AdminTh>
                    <AdminTh>Created</AdminTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((s) => (
                    <tr key={s.space_id} className="hover:bg-bg-2">
                      <AdminTd>
                        <Link
                          href={`/admin/spaces/${s.slug}`}
                          className="text-text-0 hover:text-accent"
                        >
                          {s.name}
                        </Link>
                      </AdminTd>
                      <AdminTd mono>/{s.slug}</AdminTd>
                      <AdminTd>
                        {s.archived_at ? (
                          <AdminBadge variant="warning">archived</AdminBadge>
                        ) : (
                          <AdminBadge variant="success">active</AdminBadge>
                        )}
                      </AdminTd>
                      <AdminTd>
                        <span className="text-xs text-text-3">
                          {new Date(s.created_at).toLocaleDateString()}
                        </span>
                      </AdminTd>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            </AdminPanel>
          </div>

          <div className="flex flex-col gap-2 sm:hidden">
            {rows.map((s) => (
              <AdminMobileCard key={s.space_id}>
                <AdminMobileField label="Name">
                  <Link
                    href={`/admin/spaces/${s.slug}`}
                    className="text-text-0 hover:text-accent"
                  >
                    {s.name}
                  </Link>
                </AdminMobileField>
                <AdminMobileField label="Slug" mono>
                  /{s.slug}
                </AdminMobileField>
                <AdminMobileField label="Status">
                  {s.archived_at ? (
                    <AdminBadge variant="warning">archived</AdminBadge>
                  ) : (
                    <AdminBadge variant="success">active</AdminBadge>
                  )}
                </AdminMobileField>
                <AdminMobileField label="Created">
                  <span className="text-xs text-text-3">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </AdminMobileField>
              </AdminMobileCard>
            ))}
          </div>
        </>
      )}
    </>
  );
}
