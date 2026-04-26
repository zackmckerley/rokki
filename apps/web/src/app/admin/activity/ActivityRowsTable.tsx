"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, GitCompare } from "lucide-react";
import { ActivityDiff } from "@/components/ActivityDiff";
import { cn } from "@/lib/utils";

export interface AdminActivityRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
  terminal_id: string | null;
  space_id: string | null;
  metadata: Record<string, unknown>;
  before_json: unknown;
  after_json: unknown;
  created_at: string;
}

/**
 * Admin activity table with an expandable Diff column. Click a row to see
 * the per-field before/after captured by the `log_row_change()` trigger.
 *
 * Rows without a diff payload (older app-emitted activity, member.invite,
 * tool.invoke, etc.) render the metadata blob inline as before.
 */
export function ActivityRowsTable({ rows }: { rows: AdminActivityRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded border border-border bg-bg-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
            <th className="w-8 px-2 py-2"></th>
            <th className="px-3 py-2 text-left font-semibold">When</th>
            <th className="px-3 py-2 text-left font-semibold">Action</th>
            <th className="px-3 py-2 text-left font-semibold">Entity</th>
            <th className="px-3 py-2 text-left font-semibold">Actor</th>
            <th className="px-3 py-2 text-left font-semibold">Diff / Metadata</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const hasDiff = r.before_json != null || r.after_json != null;
            const isOpen = openId === r.id;
            return (
              <RowGroup
                key={r.id}
                row={r}
                hasDiff={hasDiff}
                isOpen={isOpen}
                onToggle={() => setOpenId(isOpen ? null : r.id)}
              />
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                className="px-3 py-6 text-center text-xs text-text-3"
              >
                No activity.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function RowGroup({
  row,
  hasDiff,
  isOpen,
  onToggle,
}: {
  row: AdminActivityRow;
  hasDiff: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={cn(
          hasDiff ? "cursor-pointer hover:bg-bg-2" : "",
          isOpen ? "bg-bg-2" : "",
        )}
        onClick={hasDiff ? onToggle : undefined}
      >
        <td className="px-2 py-1.5 text-text-3">
          {hasDiff ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              aria-label={isOpen ? "Hide diff" : "Show diff"}
              className="rounded-sm p-0.5 hover:bg-bg-3"
            >
              {isOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="inline-block h-3 w-3" />
          )}
        </td>
        <td className="px-3 py-1.5 font-mono text-[11px] text-text-3">
          {new Date(row.created_at).toLocaleString()}
        </td>
        <td className="px-3 py-1.5 font-mono text-xs text-accent">
          {row.action}
        </td>
        <td className="px-3 py-1.5 text-xs text-text-2">
          {row.entity_type ?? "—"}
          {row.entity_id ? (
            <span className="ml-1 font-mono text-[10px] text-text-3">
              {row.entity_id.slice(0, 8)}
            </span>
          ) : null}
        </td>
        <td className="px-3 py-1.5 font-mono text-[10px] text-text-3">
          {row.actor_id ? (
            <Link
              href={`/admin/users/${row.actor_id}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-accent"
            >
              {row.actor_id.slice(0, 8)}
            </Link>
          ) : (
            "system"
          )}
        </td>
        <td className="px-3 py-1.5 text-[11px] text-text-3">
          {hasDiff ? (
            <span className="inline-flex items-center gap-1.5">
              <GitCompare className="h-3 w-3 text-accent" />
              <ActivityDiff
                before={row.before_json}
                after={row.after_json}
                compact
              />
            </span>
          ) : (
            <code className="font-mono">
              {truncate(JSON.stringify(row.metadata ?? {}), 100)}
            </code>
          )}
        </td>
      </tr>
      {isOpen && hasDiff ? (
        <tr className="bg-bg-0">
          <td colSpan={6} className="px-6 py-3">
            <div className="rounded border border-border bg-bg-1 p-3">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-3">
                Field-by-field diff
              </h3>
              <ActivityDiff
                before={row.before_json}
                after={row.after_json}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
