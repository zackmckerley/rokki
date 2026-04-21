import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/v1/admin/health
 *   Returns counts and pulses across the platform: row counts per
 *   public table, pending queues, last-touched timestamps for the
 *   indexer + scanner.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const tables = [
    "profiles",
    "spaces",
    "terminals",
    "tasks",
    "files",
    "tools",
    "tool_invocations",
    "messages",
    "domain_events",
    "activity",
    "rate_limit_hits",
    "session_revocations",
  ];

  const counts: Record<string, number> = {};
  await Promise.all(
    tables.map(async (t) => {
      const { count } = await admin
        .from(t as never)
        .select("*", { count: "exact", head: true });
      counts[t] = count ?? 0;
    }),
  );

  const [{ count: pendingScans }, { count: infected }, { count: pendingApprovals }, { data: lastEvent }] =
    await Promise.all([
      admin
        .from("files")
        .select("id", { count: "exact", head: true })
        .eq("virus_scan_status", "pending"),
      admin
        .from("files")
        .select("id", { count: "exact", head: true })
        .eq("virus_scan_status", "infected")
        .is("deleted_at", null),
      admin
        .from("approvals")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      admin
        .from("domain_events")
        .select("occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(1),
    ]);

  return NextResponse.json({
    data: {
      row_counts: counts,
      queues: {
        files_pending_scan: pendingScans ?? 0,
        files_infected: infected ?? 0,
        approvals_pending: pendingApprovals ?? 0,
      },
      last_event_at:
        (lastEvent as { occurred_at: string }[] | null)?.[0]?.occurred_at ??
        null,
    },
  });
}
