"use client";

import { useMemo, useState } from "react";
import {
  AdminBadge,
  AdminEmpty,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";
import {
  PARITY_ROWS,
  uniqueResources,
  type ParityRow,
  type ParityStatus,
} from "@/lib/mcp-parity";

const STATUS_VARIANT: Record<ParityStatus, "success" | "warning" | "danger" | "muted"> = {
  present: "success",
  partial: "warning",
  missing: "danger",
  "admin-only": "muted",
};

const STATUS_LABEL: Record<ParityStatus, string> = {
  present: "PRESENT",
  partial: "PARTIAL",
  missing: "MISSING",
  "admin-only": "UI-ONLY",
};

const STATUSES: ParityStatus[] = ["present", "partial", "missing", "admin-only"];

export function McpParityClient() {
  const [resourceFilter, setResourceFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<ParityStatus | "">("");
  const resources = useMemo(() => uniqueResources(), []);

  const rows = useMemo<ParityRow[]>(
    () =>
      PARITY_ROWS.filter((r) => {
        if (resourceFilter && r.resource !== resourceFilter) return false;
        if (statusFilter && r.status !== statusFilter) return false;
        return true;
      }),
    [resourceFilter, statusFilter],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Resource
          </span>
          <select
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-xs text-text-0 outline-none focus:border-border-focus"
          >
            <option value="">all</option>
            {resources.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Status
          </span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ParityStatus | "")}
            className="rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-xs text-text-0 outline-none focus:border-border-focus"
          >
            <option value="">any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-[10px] text-text-3">
          Showing <span className="font-mono text-text-1">{rows.length}</span> of{" "}
          <span className="font-mono text-text-1">{PARITY_ROWS.length}</span>
        </span>
      </div>

      {rows.length === 0 ? (
        <AdminEmpty>No rows match this filter.</AdminEmpty>
      ) : (
        <AdminPanel>
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Resource</AdminTh>
                <AdminTh>Action</AdminTh>
                <AdminTh>API endpoint</AdminTh>
                <AdminTh>MCP tool</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Note</AdminTh>
                <AdminTh align="right">Priority</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, idx) => (
                <tr
                  key={`${r.resource}-${r.action}-${idx}`}
                  className={rowTone(r.status)}
                >
                  <AdminTd mono>{r.resource}</AdminTd>
                  <AdminTd>{r.action}</AdminTd>
                  <AdminTd>
                    {r.apiEndpoints.length === 0 ? (
                      <span className="text-text-3">—</span>
                    ) : (
                      <ul className="space-y-0.5 font-mono text-[11px] text-text-2">
                        {r.apiEndpoints.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    )}
                  </AdminTd>
                  <AdminTd mono>
                    {r.mcpTool ?? <span className="text-text-3">—</span>}
                  </AdminTd>
                  <AdminTd>
                    <AdminBadge variant={STATUS_VARIANT[r.status]}>
                      {STATUS_LABEL[r.status]}
                    </AdminBadge>
                  </AdminTd>
                  <AdminTd>
                    <span className="block max-w-md text-[11px] text-text-2">
                      {r.note || (
                        <span className="text-text-3">—</span>
                      )}
                    </span>
                  </AdminTd>
                  <AdminTd align="right">
                    {r.priority ? (
                      <PriorityBadge priority={r.priority} />
                    ) : (
                      <span className="text-text-3">—</span>
                    )}
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </AdminPanel>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const styles = {
    high: "border-danger/40 bg-danger-subtle text-danger",
    medium: "border-warning/40 bg-warning-subtle text-warning",
    low: "border-border bg-bg-2 text-text-2",
  };
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${styles[priority]}`}
    >
      {priority}
    </span>
  );
}

function rowTone(status: ParityStatus): string {
  switch (status) {
    case "present":
      return "bg-success-subtle/10";
    case "partial":
      return "bg-warning-subtle/10";
    case "missing":
      return "bg-danger-subtle/10";
    default:
      return "";
  }
}
