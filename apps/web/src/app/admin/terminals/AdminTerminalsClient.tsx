"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AdminBadge,
  AdminFilterInput,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";
import { CopyableId } from "@/components/CopyableId";
import { makeFuzzyFilter, useTableSort } from "@/lib/use-table-sort";

export interface TerminalRow {
  id: string;
  ticker: string;
  name: string;
  status: string;
  archived_at: string | null;
  created_at: string;
  space_slug: string | null;
  space_name: string | null;
}

export function AdminTerminalsClient({ rows }: { rows: TerminalRow[] }) {
  const [tableFilter, setTableFilter] = useState("");

  const fuzzy = useMemo(
    () =>
      makeFuzzyFilter<TerminalRow>(tableFilter, (r) => [
        r.ticker,
        r.name,
        r.space_slug,
        r.space_name,
        r.status,
      ]),
    [tableFilter],
  );

  const { sorted, onSortClick, arrow } = useTableSort<TerminalRow>({
    rows,
    filter: fuzzy,
    defaultSort: { key: "created_at", dir: "desc" },
    getValue: (r, key) => {
      switch (key) {
        case "ticker":
          return r.ticker;
        case "name":
          return r.name;
        case "space":
          return r.space_name ?? r.space_slug;
        case "status":
          return r.archived_at ? "z-archived" : r.status;
        case "created_at":
        default:
          return r.created_at;
      }
    },
  });

  return (
    <>
      <div className="flex items-center justify-end">
        <AdminFilterInput
          value={tableFilter}
          onChange={setTableFilter}
          placeholder="Filter visible rows…"
        />
      </div>

      <AdminTable>
        <thead>
          <tr className="border-b border-border bg-bg-2">
            <AdminTh sortKey="ticker" sortDir={arrow("ticker")} onSort={onSortClick}>
              Ticker
            </AdminTh>
            <AdminTh sortKey="name" sortDir={arrow("name")} onSort={onSortClick}>
              Name
            </AdminTh>
            <AdminTh sortKey="space" sortDir={arrow("space")} onSort={onSortClick}>
              Space
            </AdminTh>
            <AdminTh sortKey="status" sortDir={arrow("status")} onSort={onSortClick}>
              Status
            </AdminTh>
            <AdminTh
              sortKey="created_at"
              sortDir={arrow("created_at")}
              onSort={onSortClick}
            >
              Created
            </AdminTh>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((t) => (
            <tr key={t.id} className="hover:bg-bg-2">
              <AdminTd mono className="text-accent">
                <div className="flex items-center gap-1">
                  <Link
                    href={`/admin/terminals/${t.ticker}`}
                    className="hover:underline"
                  >
                    {t.ticker}
                  </Link>
                  <CopyableId
                    value={t.ticker}
                    label="ticker"
                    display=""
                    className="px-0.5"
                  />
                </div>
              </AdminTd>
              <AdminTd>
                <Link
                  href={`/admin/terminals/${t.ticker}`}
                  className="text-text-0 hover:text-accent"
                >
                  {t.name}
                </Link>
              </AdminTd>
              <AdminTd>
                {t.space_slug ? (
                  <Link
                    href={`/admin/spaces/${t.space_slug}`}
                    className="text-text-2 hover:text-accent"
                  >
                    {t.space_name ?? t.space_slug}
                  </Link>
                ) : (
                  <span className="text-text-3">—</span>
                )}
              </AdminTd>
              <AdminTd>
                <AdminBadge
                  variant={
                    t.archived_at
                      ? "warning"
                      : t.status === "active"
                        ? "success"
                        : t.status === "blocked"
                          ? "danger"
                          : "muted"
                  }
                >
                  {t.archived_at ? "archived" : t.status}
                </AdminBadge>
              </AdminTd>
              <AdminTd>
                <span className="text-xs text-text-3">
                  {new Date(t.created_at).toLocaleDateString()}
                </span>
              </AdminTd>
            </tr>
          ))}
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="px-3 py-6 text-center text-xs text-text-3"
              >
                {tableFilter
                  ? "No rows match the filter."
                  : "No terminals match this filter."}
              </td>
            </tr>
          ) : null}
        </tbody>
      </AdminTable>
    </>
  );
}
