import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/v1/admin/spaces/:slug/members  { user_id, role }
 *   Add or update a user's role in this space (admin bypasses normal
 *   invite flow). PATCH-shaped POST: idempotent.
 */

const ROLES = ["owner", "admin", "member"] as const;

async function handlePost(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    user_id?: string;
    role?: (typeof ROLES)[number];
  };
  if (!body.user_id) return bad("user_id required");
  const role = body.role ?? "member";
  if (!ROLES.includes(role)) return bad("invalid role");

  const { data: space } = await admin
    .from("spaces")
    .select("id")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!space)
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "Space not found" }] },
      { status: 404 },
    );
  const spaceId = (space as { id: string }).id;

  await admin
    .from("space_members")
    .upsert(
      { space_id: spaceId, user_id: body.user_id, role } as never,
      { onConflict: "space_id,user_id" },
    );

  void emitEvent("admin.space.member_changed", {
    actor_id: actorId,
    space_id: spaceId,
    entity_type: "user",
    entity_id: body.user_id,
    payload: { role },
  });

  return NextResponse.json({
    data: { space_id: spaceId, user_id: body.user_id, role },
  });
}

function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}

export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/admin/spaces/:slug/members",
);
