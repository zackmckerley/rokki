import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
/**
 * GET  /api/v1/admin/emergency
 *   Lists emergency-access grants. ?active=true filters to currently
 *   in-effect grants only.
 *
 * POST /api/v1/admin/emergency
 *   { target_user_id, target_terminal_id?, target_space_id?, hours, reason }
 *   Creates a time-boxed access grant. The reason is required and must be
 *   ≥ 10 chars; this is what shows in audit and in the notification we
 *   deliver to the affected space owner.
 *
 *   The grant itself is materialised by inserting the admin into
 *   terminal_members (role: guest) until `active_until` so RLS lets them
 *   read. Revocation removes the membership row + sets revoked_at.
 */
async function handleGet(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const onlyActive = url.searchParams.get("active") === "true";

  let query = admin
    .from("emergency_access_events")
    .select(
      "id, admin_id, target_user_id, target_space_id, target_terminal_id, reason, started_at, ended_at, active_until, revoked_at, revoked_by, notified_target",
    )
    .order("started_at", { ascending: false })
    .limit(200);

  if (onlyActive) {
    query = query
      .is("revoked_at", null)
      .gt("active_until", new Date().toISOString());
  }

  const { data, error } = await query;
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );
  return NextResponse.json({ data: data ?? [] });
}

async function handlePost(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    target_user_id?: string;
    target_space_id?: string;
    target_terminal_id?: string;
    hours?: number;
    reason?: string;
  };

  const target = body.target_user_id?.trim();
  if (!target) return bad("target_user_id required");
  const hours = Math.min(Math.max(Math.round(body.hours ?? 0), 1), 24);
  if (!Number.isFinite(hours) || hours < 1)
    return bad("hours must be 1–24");
  const reason = (body.reason ?? "").trim();
  if (reason.length < 10) return bad("reason must be ≥ 10 chars");
  if (!body.target_space_id && !body.target_terminal_id)
    return bad("target_space_id or target_terminal_id required");

  const activeUntil = new Date(Date.now() + hours * 3600_000).toISOString();

  // 1) Insert the audit row.
  const { data: rec, error: insErr } = await admin
    .from("emergency_access_events")
    .insert({
      admin_id: actorId,
      target_user_id: target,
      target_space_id: body.target_space_id ?? null,
      target_terminal_id: body.target_terminal_id ?? null,
      target_org_id: body.target_space_id ?? null,
      target_project_id: body.target_terminal_id ?? null,
      reason,
      active_until: activeUntil,
    } as never)
    .select("id")
    .single();
  if (insErr || !rec)
    return NextResponse.json(
      {
        errors: [
          {
            code: "internal_error",
            message: insErr?.message ?? "insert failed",
          },
        ],
      },
      { status: 500 },
    );

  // 2) If terminal-scoped, add the admin (NOT the target) to the terminal
  // as a guest member so they can read. The grant is the admin getting
  // access to inspect; the target_user_id field is who they're supporting.
  if (body.target_terminal_id) {
    await admin
      .from("terminal_members")
      .upsert(
        {
          terminal_id: body.target_terminal_id,
          user_id: actorId,
          role: "guest",
          added_by: actorId,
        } as never,
        { onConflict: "terminal_id,user_id" },
      );
  }
  if (body.target_space_id) {
    await admin
      .from("space_members")
      .upsert(
        {
          space_id: body.target_space_id,
          user_id: actorId,
          role: "member",
        } as never,
        { onConflict: "space_id,user_id" },
      );
  }

  void emitEvent("admin.emergency_access.granted", {
    actor_id: actorId,
    space_id: body.target_space_id ?? undefined,
    terminal_id: body.target_terminal_id ?? undefined,
    entity_type: "user",
    entity_id: target,
    payload: { hours, reason, active_until: activeUntil },
  });

  return NextResponse.json(
    { data: { id: (rec as { id: string }).id, active_until: activeUntil } },
    { status: 201 },
  );
}

function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/admin/emergency",
);
export const POST = withObservability(
  handlePost,
  "POST /api/v1/admin/emergency",
);
