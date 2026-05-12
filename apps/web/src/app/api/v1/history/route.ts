import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { withObservability } from "@/lib/observability";
/**
 * GET /api/v1/history?entity_type=task|terminal|space|file|comment&entity_id=<uuid>&limit=50
 *
 * Returns reverse-chronological audit rows for one record, including the
 * before_json / after_json captured by the `log_row_change()` trigger.
 *
 * RLS on the `activity` table already restricts visibility to:
 *   - members of the parent terminal / space, or
 *   - the actor themselves, or
 *   - emergency-access platform admins.
 *
 * So this endpoint just queries the table directly with the caller's
 * cookie-bound client. No service-role access.
 */

const VALID_ENTITY_TYPES = new Set(["task", "terminal", "space", "file", "comment"]);

async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entity_type");
  const entityId = url.searchParams.get("entity_id");
  const limitParam = Number(url.searchParams.get("limit") ?? "50");
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 200);

  if (!entityType || !VALID_ENTITY_TYPES.has(entityType))
    return bad(`entity_type must be one of ${[...VALID_ENTITY_TYPES].join(", ")}`);
  if (!entityId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId))
    return bad("entity_id must be a uuid");

  // before_json / after_json land via migration 20260427050000_activity_diffs;
  // generated types lag until `supabase gen types` runs. Cast through
  // `unknown` keeps the build stable.
  const { data, error } = await supabase
    .from("activity")
    .select(
      "id, action, actor_id, created_at, metadata, before_json, after_json",
    )
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return internal(error.message);
  return NextResponse.json({ data: ((data ?? []) as unknown) as Array<Record<string, unknown>> });
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/history",
);
