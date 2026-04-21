import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/v1/admin/spaces/:slug/restore
 *   Clears archived_at. Idempotent.
 */
export async function POST(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

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

  const { error } = await admin
    .from("spaces")
    .update({ archived_at: null } as never)
    .eq("id", s.id);
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.space.restored", {
    actor_id: actorId,
    space_id: s.id,
    entity_type: "space",
    entity_id: s.id,
    payload: { name: s.name },
  });

  return NextResponse.json({ data: { restored: true } });
}
