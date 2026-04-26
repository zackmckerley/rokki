"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AdminFilterInput,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";
import { CopyableId } from "@/components/CopyableId";
import { makeFuzzyFilter, useTableSort } from "@/lib/use-table-sort";

export interface ActivityRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
  terminal_id: string | null;
  space_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function AdminActivityTable({ rows }: { rows: ActivityRow[] }) {
  const [tableFilter, setTableFilter] = useState("");

  const fuzzy = useMemo(
    () =>
      makeFuzzyFilter<ActivityRow>(tableFilter, (r) => [
        r.action,
        r.entity_type,
        r.entity_id,
        r.actor_id,
        JSON.stringify(r.metadata),
      ]),
    [tableFilter],
  );

  const { sorted, onSortClick, arrow } = useTableSort<ActivityRow>({
    rows,
    filter: fuzzy,
    defaultSort: { key: "created_at", dir: "desc" },
    getValue: (r, key) => {
      switch (key) {
        case "action":
          return r.action;
        case "entity_type":
          return r.entity_type;
        case "actor_id":
          return r.actor_id;
        case "created_at":
        default:
          return r.created_at;
      }
    },
  });

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-3">
          {tableFilter
            ? `${sorted.length} / ${rows.length} rows visible`
            : `${rows.length} row${rows.length === 1 ? "" : "s"}`}
        </span>
        <AdminFilterInput
          value={tableFilter}
          onChange={setTableFilter}
          placeholder="Filter visible rows…"
        />
      </div>
      <AdminTable>
        <thead>
          <tr className="border-b border-border bg-bg-2">
            <AdminTh
              sortKey="created_at"
              sortDir={arrow("created_at")}
              onSort={onSortClick}
            >
              When
            </AdminTh>
            <AdminTh sortKey="action" sortDir={arrow("action")} onSort={onSortClick}>
              Action
            </AdminTh>
            <AdminTh
              sortKey="entity_type"
              sortDir={arrow("entity_type")}
              onSort={onSortClick}
            >
              Entity
            </AdminTh>
            <AdminTh
              sortKey="actor_id"
              sortDir={arrow("actor_id")}
              onSort={onSortClick}
            >
              Actor
            </AdminTh>
            <AdminTh>Metadata</AdminTh>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((r) => (
            <tr key={r.id}>
              <AdminTd className="font-mono text-[11px] text-text-3 py-1.5">
                {new Date(r.created_at).toLocaleString()}
              </AdminTd>
              <AdminTd className="font-mono text-xs text-accent py-1.5">
                {r.action}
              </AdminTd>
              <AdminTd className="text-xs text-text-2 py-1.5">
                <span className="inline-flex items-center gap-1">
                  <span>{r.entity_type ?? "—"}</span>
                  {r.entity_id ? (
                    <CopyableId
                      value={r.entity_id}
                      label="entity id"
                      truncate={8}
                      className="text-[10px]"
                    />
                  ) : null}
                </span>
              </AdminTd>
              <AdminTd className="font-mono text-[10px] text-text-3 py-1.5">
                {r.actor_id ? (
                  <span className="inline-flex items-center gap-1">
                    <Link
                      href={`/admin/users/${r.actor_id}`}
                      className="hover:text-accent"
                    >
                      {r.actor_id.slice(0, 8)}
                    </Link>
                    <CopyableId
                      value={r.actor_id}
                      label="actor id"
                      display=""
                      className="px-0.5 text-[10px]"
                    />
                  </span>
                ) : (
                  "system"
                )}
              </AdminTd>
              <AdminTd className="font-mono text-[11px] text-text-3 py-1.5">
                <code className="truncate">
                  {JSON.stringify(r.metadata).slice(0, 100)}
                </code>
              </AdminTd>
            </tr>
          ))}
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="px-3 py-6 text-center text-xs text-text-3"
              >
                {tableFilter ? "No rows match the filter." : "No activity."}
              </td>
            </tr>
          ) : null}
        </tbody>
      </AdminTable>
    </>
  );
}
