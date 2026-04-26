import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/v1/admin/jobs?queue=&status=&limit=
 *
 * Read-only feed for the admin UI. Filters by queue and status; returns
 * the most-recent rows first.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const queue = url.searchParams.get("queue");
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  let q = admin
    .from("jobs")
    .select(
      "id, queue, payload, status, attempt, max_attempts, next_run_at, last_error, locked_by, locked_at, created_at, completed_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (queue) q = q.eq("queue", queue);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );
  }

  // Counts by status, again for the admin UI header.
  const counts = await Promise.all(
    ["pending", "running", "done", "failed", "dead"].map(async (s) => {
      let cq = admin.from("jobs").select("id", { count: "exact", head: true }).eq("status", s);
      if (queue) cq = cq.eq("queue", queue);
      const { count } = await cq;
      return [s, count ?? 0] as const;
    }),
  );

  // Distinct queue names so the filter dropdown is data-driven.
  const { data: queueRows } = await admin
    .from("jobs")
    .select("queue")
    .order("queue");
  const queues = Array.from(
    new Set(((queueRows ?? []) as { queue: string }[]).map((r) => r.queue)),
  );

  return NextResponse.json({
    data: data ?? [],
    meta: {
      counts: Object.fromEntries(counts),
      queues,
    },
  });
}
