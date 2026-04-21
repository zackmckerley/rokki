import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

interface Props {
  params: Promise<{ userId: string }>;
}

/**
 * POST /api/v1/admin/users/:userId/memberships
 *   { space_id, role }          → insert a space_members row
 *
 * DELETE /api/v1/admin/users/:userId/memberships?space_id=...
 *   Remove the user from that space. Terminal memberships in that space
 *   cascade out via FK.
 */

const SPACE_ROLES = ["owner", "admin", "member"] as const;

export async function POST(request: NextRequest, { params }: Props) {
  const { userId } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    space_id?: string;
    role?: (typeof SPACE_ROLES)[number];
  };
  if (!body.space_id) return bad("space_id required");
  const role = body.role ?? "member";
  if (!SPACE_ROLES.includes(role)) return bad("invalid role");

  const { data: existing } = await admin
    .from("space_members")
    .select("space_id, role")
    .eq("space_id", body.space_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    // Already a member — update role if it differs.
    if ((existing as { role: string }).role !== role) {
      const { error } = await admin
        .from("space_members")
        .update({ role } as never)
        .eq("space_id", body.space_id)
        .eq("user_id", userId);
      if (error) return internal(error.message);
    }
  } else {
    const { error } = await admin.from("space_members").insert({
      space_id: body.space_id,
      user_id: userId,
      role,
    } as never);
    if (error) return internal(error.message);
  }

  void emitEvent("admin.membership.added", {
    actor_id: actorId,
    space_id: body.space_id,
    entity_type: "user",
    entity_id: userId,
    payload: { role },
  });

  return NextResponse.json({
    data: { user_id: userId, space_id: body.space_id, role },
  });
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const { userId } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const url = new URL(request.url);
  const spaceId = url.searchParams.get("space_id");
  if (!spaceId) return bad("space_id query param required");

  const { error } = await admin
    .from("space_members")
    .delete()
    .eq("space_id", spaceId)
    .eq("user_id", userId);
  if (error) return internal(error.message);

  void emitEvent("admin.membership.removed", {
    actor_id: actorId,
    space_id: spaceId,
    entity_type: "user",
    entity_id: userId,
    payload: {},
  });

  return new NextResponse(null, { status: 204 });
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
