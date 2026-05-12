import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/v1/admin/emergency/:id
 *   Revokes the grant: removes the admin from the targeted terminal /
 *   space, sets revoked_at + revoked_by + ended_at on the event row.
 */
async function handleDelete(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const { data: row } = await admin
    .from("emergency_access_events")
    .select(
      "id, admin_id, target_terminal_id, target_space_id, revoked_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!row)
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "Grant not found" }] },
      { status: 404 },
    );
  const r = row as {
    id: string;
    admin_id: string;
    target_terminal_id: string | null;
    target_space_id: string | null;
    revoked_at: string | null;
  };
  if (r.revoked_at)
    return NextResponse.json(
      { data: { already: true } },
      { status: 200 },
    );

  // Pull the admin's membership back out.
  if (r.target_terminal_id) {
    await admin
      .from("terminal_members")
      .delete()
      .eq("terminal_id", r.target_terminal_id)
      .eq("user_id", r.admin_id);
  }
  if (r.target_space_id) {
    await admin
      .from("space_members")
      .delete()
      .eq("space_id", r.target_space_id)
      .eq("user_id", r.admin_id);
  }

  await admin
    .from("emergency_access_events")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: actorId,
      ended_at: new Date().toISOString(),
    } as never)
    .eq("id", id);

  void emitEvent("admin.emergency_access.revoked", {
    actor_id: actorId,
    space_id: r.target_space_id ?? undefined,
    terminal_id: r.target_terminal_id ?? undefined,
    entity_type: "emergency_access",
    entity_id: id,
    payload: {},
  });

  return new NextResponse(null, { status: 204 });
}

export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/admin/emergency/:id",
);
