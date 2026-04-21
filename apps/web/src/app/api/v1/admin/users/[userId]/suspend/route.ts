import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";
import { revokeSessions } from "@/lib/revocations";

interface Props {
  params: Promise<{ userId: string }>;
}

/**
 * POST /api/v1/admin/users/:userId/suspend
 *   { hours: number >= 1, reason: string }
 *
 *   Applies a Supabase Auth ban for `hours`. `ban_duration` is a string
 *   like "24h" per Supabase. Revokes active sessions immediately.
 *
 * DELETE (aka unsuspend) /api/v1/admin/users/:userId/suspend
 *   Clears the ban.
 */
export async function POST(request: NextRequest, { params }: Props) {
  const { userId } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  if (userId === actorId) {
    return bad("cannot suspend yourself");
  }

  const body = (await request.json().catch(() => ({}))) as {
    hours?: number;
    reason?: string;
  };
  const hours = Math.min(Math.max(Math.round(body.hours ?? 0), 1), 24 * 365);
  if (!Number.isFinite(hours) || hours < 1) return bad("hours must be ≥ 1");
  const reason = (body.reason ?? "").trim();
  if (reason.length > 1000) return bad("reason must be ≤ 1000 chars");

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: `${hours}h`,
  });
  if (error) return internal(error.message);

  await revokeSessions(admin, { userId, reason: "admin_action" });

  // Attach a note so the reason is auditable.
  if (reason) {
    await admin.from("admin_notes").insert({
      target_user_id: userId,
      author_user_id: actorId,
      body: `[suspend ${hours}h] ${reason}`,
    } as never);
  }

  void emitEvent("admin.user.suspended", {
    actor_id: actorId,
    entity_type: "user",
    entity_id: userId,
    payload: { hours, reason },
  });

  return NextResponse.json({
    data: { user_id: userId, suspended: true, hours },
  });
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const { userId } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  // ban_duration: "none" lifts the ban.
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (error) return internal(error.message);

  void emitEvent("admin.user.unsuspended", {
    actor_id: actorId,
    entity_type: "user",
    entity_id: userId,
    payload: {},
  });

  return NextResponse.json({ data: { user_id: userId, suspended: false } });
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
