import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

import { withObservability } from "@/lib/observability";
/**
 * POST /api/v1/admin/perf/reset
 *
 * Calls pg_stat_statements_reset(). Useful when an admin wants to
 * re-baseline the slow-query view after deploying a fix or applying
 * an index.
 */
async function handlePost(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const { error } = await (
    admin.rpc as unknown as (fn: string) => Promise<{
      data: boolean | null;
      error: { message: string } | null;
    }>
  )("reset_slow_queries");

  if (error) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "reset_failed",
            message: error.message,
          },
        ],
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ data: { reset: true } });
}

export const POST = withObservability(
  handlePost,
  "POST /api/v1/admin/perf/reset",
);
