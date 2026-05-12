import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
interface ApprovalRow {
  id: string;
  type: string;
  approver_space_id: string | null;
  subject_type: string;
  subject_id: string;
  requester_id: string;
  status: string;
}

interface ItemResult {
  id: string;
  status: "approved" | "denied" | "skipped" | "error";
  reason?: string;
}

/**
 * POST /api/v1/approvals/bulk
 *   { ids: string[], decision: "approved" | "denied", note?: string }
 *
 * Bulk version of `PATCH /api/v1/approvals/:id` — same RLS-respecting
 * authorization rules apply per-row. The endpoint:
 *
 *   1. Loads every requested approval (still pending, not expired).
 *   2. Confirms the caller is owner/admin of each row's `approver_space_id`,
 *      OR a platform admin when `approver_space_id` is null.
 *   3. Updates the rows the caller is authorized to act on; skips the rest.
 *   4. Emits one `approval.resolved` event per resolved row.
 *
 * Returns a per-id result so the UI can show what succeeded vs. what was
 * skipped (e.g. "you don't admin that space" or "already resolved").
 */
async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    ids?: unknown;
    decision?: unknown;
    note?: unknown;
  };

  const ids = Array.isArray(body.ids)
    ? (body.ids.filter((v): v is string => typeof v === "string"))
    : [];
  if (ids.length === 0) return bad("ids: non-empty array required");
  if (ids.length > 100) return bad("ids: max 100 per request");

  const decision = body.decision;
  if (decision !== "approved" && decision !== "denied")
    return bad("decision must be 'approved' or 'denied'");

  const note =
    typeof body.note === "string" ? body.note.slice(0, 1000).trim() : null;

  // Load the rows. RLS lets the caller see approvals they're a party to
  // (requester or approver). For approve/deny the per-row auth check below
  // is the source of truth.
  const { data: existing, error: loadErr } = await supabase
    .from("approvals")
    .select(
      "id, type, approver_space_id, subject_type, subject_id, requester_id, status",
    )
    .in("id", ids);
  if (loadErr) return internal(loadErr.message);

  const rows = ((existing ?? []) as ApprovalRow[]);
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Find the unique approver spaces and check the caller's role in each in
  // a single query (avoids N round-trips for big bulk actions).
  const spaceIds = new Set<string>();
  let needsPlatformAdmin = false;
  for (const r of rows) {
    if (r.approver_space_id) spaceIds.add(r.approver_space_id);
    else needsPlatformAdmin = true;
  }

  let allowedSpaces = new Set<string>();
  if (spaceIds.size > 0) {
    const { data: memberships } = await supabase
      .from("space_members")
      .select("space_id, role")
      .eq("user_id", user.id)
      .in("space_id", Array.from(spaceIds))
      .in("role", ["owner", "admin"]);
    allowedSpaces = new Set(
      ((memberships ?? []) as { space_id: string }[]).map((m) => m.space_id),
    );
  }

  let isPlatformAdmin = false;
  if (needsPlatformAdmin) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .maybeSingle();
    isPlatformAdmin =
      (prof as { is_platform_admin?: boolean } | null)?.is_platform_admin ===
      true;
  }

  const results: ItemResult[] = [];
  const toUpdate: ApprovalRow[] = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      results.push({ id, status: "skipped", reason: "not_found" });
      continue;
    }
    if (row.status !== "pending") {
      results.push({ id, status: "skipped", reason: "already_resolved" });
      continue;
    }
    const authorized = row.approver_space_id
      ? allowedSpaces.has(row.approver_space_id)
      : isPlatformAdmin;
    if (!authorized) {
      results.push({ id, status: "skipped", reason: "forbidden" });
      continue;
    }
    toUpdate.push(row);
  }

  if (toUpdate.length > 0) {
    const updateIds = toUpdate.map((r) => r.id);
    const { error: updateErr } = await supabase
      .from("approvals")
      // @ts-expect-error Phase 0 generics
      .update({
        status: decision,
        note,
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      })
      .in("id", updateIds);
    if (updateErr) {
      // Don't half-emit events; report the error and let the UI re-fetch.
      return internal(updateErr.message);
    }

    for (const row of toUpdate) {
      results.push({ id: row.id, status: decision });
      void emitEvent("approval.resolved", {
        actor_id: user.id,
        space_id: row.approver_space_id ?? undefined,
        entity_type: "approval",
        entity_id: row.id,
        payload: {
          decision,
          type: row.type,
          subject_id: row.subject_id,
          bulk: true,
          note,
        },
      });
    }
  }

  // Restore original input order for the response.
  results.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  const resolved = results.filter((r) => r.status === decision).length;
  const skipped = results.length - resolved;

  return NextResponse.json({
    data: { decision, resolved, skipped, results },
  });
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

export const POST = withObservability(
  handlePost,
  "POST /api/v1/approvals/bulk",
);
