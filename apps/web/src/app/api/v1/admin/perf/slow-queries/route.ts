import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/v1/admin/perf/slow-queries
 *
 * Returns the top 50 slow queries from pg_stat_statements ordered by
 * mean_exec_time DESC. Requires the `pg_stat_statements` extension to
 * be enabled on the Postgres instance — on Supabase this is a one-time
 * dashboard toggle (Database -> Extensions -> pg_stat_statements).
 *
 * Platform-admin only. The wrapping RPC `public.get_slow_queries` is
 * SECURITY DEFINER and only granted to service_role.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const limit = Math.max(
    1,
    Math.min(200, parseInt(url.searchParams.get("limit") ?? "50", 10)),
  );

  // RPC isn't in the generated Database types because pg_stat_statements
  // ships in its own extension schema. Cast through unknown.
  const { data, error } = await (
    admin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: SlowQueryRow[] | null; error: { message: string } | null }>
  )("get_slow_queries", { _limit: limit });

  if (error) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "pg_stat_statements_unavailable",
            message:
              "pg_stat_statements not available. Enable it on the Supabase dashboard (Database -> Extensions).",
            detail: error.message,
          },
        ],
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ data: data ?? [] });
}

interface SlowQueryRow {
  query: string;
  calls: number;
  mean_exec_time: number;
  total_exec_time: number;
  rows: number;
}
