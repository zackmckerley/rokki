import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * PATCH  /api/v1/admin/invitations/:id   { extend_days? }   → bump expires_at
 * DELETE /api/v1/admin/invitations/:id                       → revoke (mark accepted_at = now with accepted_by = null is wrong;
 *                                                              we hard-delete instead so the magic link stops working)
 */
export async function PATCH(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    extend_days?: number;
  };
  const days = Math.min(Math.max(Math.round(body.extend_days ?? 7), 1), 90);

  const next = new Date(Date.now() + days * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("invites")
    .update({ expires_at: next } as never)
    .eq("id", id)
    .select("id, email, expires_at")
    .single();
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.invitation.extended", {
    actor_id: actorId,
    entity_type: "invite",
    entity_id: id,
    payload: { extend_days: days },
  });

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const { data: existing } = await admin
    .from("invites")
    .select("email")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("invites").delete().eq("id", id);
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.invitation.revoked", {
    actor_id: actorId,
    entity_type: "invite",
    entity_id: id,
    payload: { email: (existing as { email?: string } | null)?.email ?? null },
  });

  return new NextResponse(null, { status: 204 });
}
