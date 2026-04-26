import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

/**
 * POST /api/v1/admin/trash/purge   { cutoff_days?: number = 30 }
 *
 * Calls the SQL function `purge_expired_trash(_cutoff_days)`. Returns a
 * row-count breakdown by table. Scheduling is the operator's call — this
 * endpoint just exposes the function so a manual run, an external cron,
 * or pg_cron can all invoke it.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    cutoff_days?: number;
  };
  const days = Math.min(
    Math.max(Math.round(body.cutoff_days ?? 30), 1),
    365,
  );

  // The `purge_expired_trash` function lives in migration
  // 20260427060000_soft_delete_consistency; generated RPC types lag
  // until `supabase gen types` runs. Cast through unknown so the build
  // doesn't depend on regen.
  const { data, error } = (await (admin.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: Array<{ table_name: string; purged: number }> | null;
    error: { message: string } | null;
  }>)("purge_expired_trash", { _cutoff_days: days }));
  if (error) {
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as Array<{ table_name: string; purged: number }>;
  const total = rows.reduce((acc, r) => acc + Number(r.purged ?? 0), 0);

  void emitEvent("admin.trash.purged", {
    actor_id: actorId,
    entity_type: "trash",
    entity_id: actorId,
    payload: { cutoff_days: days, total, by_table: rows },
  });

  return NextResponse.json({
    data: { cutoff_days: days, total, by_table: rows },
  });
}
