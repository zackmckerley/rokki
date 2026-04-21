import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/v1/admin/spaces/:slug/transfer-owner
 *   { new_owner_user_id }
 *
 * Promotes the target user to owner. Demotes any current owners to admin
 * (a space can have multiple owners by schema, but the convention is one).
 */
export async function POST(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    new_owner_user_id?: string;
  };
  const newOwner = body.new_owner_user_id?.trim();
  if (!newOwner)
    return NextResponse.json(
      { errors: [{ code: "invalid_request", message: "new_owner_user_id required" }] },
      { status: 400 },
    );

  const { data: space } = await admin
    .from("spaces")
    .select("id, name")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!space)
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "Space not found" }] },
      { status: 404 },
    );
  const s = space as { id: string; name: string };

  // The target must already be a member; transfer doesn't auto-grant access.
  const { data: existing } = await admin
    .from("space_members")
    .select("user_id, role")
    .eq("space_id", s.id)
    .eq("user_id", newOwner)
    .maybeSingle();
  if (!existing)
    return NextResponse.json(
      {
        errors: [
          {
            code: "invalid_request",
            message: "Target user is not a member of this space; add them first.",
          },
        ],
      },
      { status: 400 },
    );

  // Demote current owners.
  await admin
    .from("space_members")
    .update({ role: "admin" } as never)
    .eq("space_id", s.id)
    .eq("role", "owner");

  // Promote target.
  await admin
    .from("space_members")
    .update({ role: "owner" } as never)
    .eq("space_id", s.id)
    .eq("user_id", newOwner);

  void emitEvent("admin.space.owner_transferred", {
    actor_id: actorId,
    space_id: s.id,
    entity_type: "space",
    entity_id: s.id,
    payload: { new_owner: newOwner },
  });

  return NextResponse.json({ data: { space_id: s.id, owner: newOwner } });
}
