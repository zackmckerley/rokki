import { AdminSectionHeader } from "@/components/admin/primitives";
import { McpParityClient } from "./McpParityClient";
import { countByStatus, PARITY_ROWS } from "@/lib/mcp-parity";

export const metadata = { title: "MCP parity — Admin" };
export const dynamic = "force-dynamic";

/**
 * Coverage matrix: every API endpoint × MCP tool. Built off
 * apps/web/src/lib/mcp-parity.ts (the single source of truth — also
 * used by docs/12_MCP_PARITY.md). Re-render is cheap because the data
 * is static; no DB hit needed.
 */
export default function AdminMcpPage() {
  const counts = countByStatus();
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="MCP parity"
        description="Every UI/API capability vs MCP tool surface. Green = parity. Yellow = partial (read but no write, etc.). Red = MCP gap. Grey = intentionally UI-only (admin / browser-only flows)."
      />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Present" value={counts.present} variant="success" />
        <Stat label="Partial" value={counts.partial} variant="warning" />
        <Stat label="Missing" value={counts.missing} variant="danger" />
        <Stat label="Admin-only" value={counts["admin-only"]} variant="muted" />
      </div>
      <p className="text-[11px] text-text-3">
        Total rows audited: <span className="font-mono text-text-1">{PARITY_ROWS.length}</span>.
        Source: <code className="font-mono text-accent">apps/web/src/lib/mcp-parity.ts</code>.
        Doc:{" "}
        <code className="font-mono text-accent">docs/12_MCP_PARITY.md</code>.
      </p>
      <McpParityClient />
    </div>
  );
}

function Stat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "success" | "warning" | "danger" | "muted";
}) {
  const tone: Record<typeof variant, string> = {
    success: "border-success/40 bg-success-subtle/20",
    warning: "border-warning/40 bg-warning-subtle/20",
    danger: "border-danger/40 bg-danger-subtle/20",
    muted: "border-border bg-bg-1",
  };
  return (
    <div className={`flex items-center justify-between rounded border bg-bg-1 px-3 py-2 ${tone[variant]}`}>
      <span className="text-[10px] uppercase tracking-wide text-text-3">
        {label}
      </span>
      <span className="font-mono text-2xl tabular-nums text-text-0">
        {value}
      </span>
    </div>
  );
}
