import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

import { withObservability } from "@/lib/observability";
/**
 * POST /api/v1/admin/perf/explain
 * Body: { query: string }
 *
 * Runs EXPLAIN (no ANALYZE — never executes side-effects) on a
 * pg_stat_statements normalized statement. Parameter placeholders
 * ($1, $2, ...) are substituted with NULL inside the RPC. SELECT/WITH
 * statements only.
 */
async function handlePost(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { errors: [{ code: "bad_request", message: "JSON body required." }] },
      { status: 400 },
    );
  }
  const query =
    body && typeof body === "object" && "query" in body
      ? String((body as { query: unknown }).query ?? "")
      : "";
  if (!query.trim()) {
    return NextResponse.json(
      { errors: [{ code: "bad_request", message: "Missing `query`." }] },
      { status: 400 },
    );
  }

  const { data, error } = await (
    admin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: Array<{ line: string }> | null;
      error: { message: string } | null;
    }>
  )("explain_slow_query", { _query: query });

  if (error) {
    return NextResponse.json(
      { errors: [{ code: "explain_failed", message: error.message }] },
      { status: 400 },
    );
  }

  return NextResponse.json({
    data: { plan: (data ?? []).map((r) => r.line).join("\n") },
  });
}

export const POST = withObservability(
  handlePost,
  "POST /api/v1/admin/perf/explain",
);
