import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events";
import { revokeSessions } from "@/lib/revocations";

interface Props {
  params: Promise<{ slug: string; userId: string }>;
}

type SpaceRole = "owner" | "admin" | "member";

const VALID_ROLES: SpaceRole[] = ["owner", "admin", "member"];

/**
 * PATCH  /api/v1/orgs/:slug/members/:userId  { role }
 * DELETE /api/v1/orgs/:slug/members/:userId
 *
 * The last space owner cannot demote or remove themselves. Self-removal is
 * a normal "leave space" flow and removes the member's terminal memberships
 * via CASCADE — that's intentional.
 */

export async function PATCH(request: NextRequest, { params }: Props) {
  const { slug, userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const space = await resolveSpace(supabase, slug);
  if (!space) return notFound();

  const callerRole = await roleOf(supabase, space.id, user.id);
  if (callerRole !== "owner" && callerRole !== "admin")
    return forbidden("only owners or admins can change roles");

  const body = (await request.json().catch(() => ({}))) as {
    role?: SpaceRole;
  };
  if (!body.role || !VALID_ROLES.includes(body.role))
    return bad(`role must be one of ${VALID_ROLES.join(", ")}`);

  // Admins can't promote anyone to owner; only owners can.
  if (body.role === "owner" && callerRole !== "owner")
    return forbidden("only owners can grant ownership");

  if (userId === user.id && body.role !== "owner") {
    const { count } = await supabase
      .from("space_members")
      .select("user_id", { count: "exact", head: true })
      .eq("space_id", space.id)
      .eq("role", "owner");
    if ((count ?? 0) <= 1)
      return bad("promote another member to owner before demoting yourself");
  }

  const { error } = await supabase
    .from("space_members")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .update({ role: body.role })
    .eq("space_id", space.id)
    .eq("user_id", userId);

  if (error) return internal(error.message);

  void emitEvent("space.member.role_changed", {
    actor_id: user.id,
    space_id: space.id,
    entity_type: "user",
    entity_id: userId,
    payload: { role: body.role },
  });

  return NextResponse.json({ data: { user_id: userId, role: body.role } });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const { slug, userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const space = await resolveSpace(supabase, slug);
  if (!space) return notFound();

  const callerRole = await roleOf(supabase, space.id, user.id);

  if (userId !== user.id && callerRole !== "owner" && callerRole !== "admin")
    return forbidden("only owners or admins can remove members");

  if (userId === user.id && callerRole === "owner") {
    const { count } = await supabase
      .from("space_members")
      .select("user_id", { count: "exact", head: true })
      .eq("space_id", space.id)
      .eq("role", "owner");
    if ((count ?? 0) <= 1)
      return bad("promote another member to owner before leaving");
  }

  const { error } = await supabase
    .from("space_members")
    .delete()
    .eq("space_id", space.id)
    .eq("user_id", userId);

  if (error) return internal(error.message);

  void emitEvent("space.member.removed", {
    actor_id: user.id,
    space_id: space.id,
    entity_type: "user",
    entity_id: userId,
    payload: { self: userId === user.id },
  });

  if (userId !== user.id) {
    void revokeSessions(supabase, {
      userId,
      reason: "space_member_removed",
      scopeType: "space",
      scopeId: space.id,
    });
  }

  return NextResponse.json({ data: { removed: true } });
}

async function resolveSpace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
) {
  const { data } = await supabase
    .from("spaces")
    .select("id, slug, name")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  return data as { id: string; slug: string; name: string } | null;
}

async function roleOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  spaceId: string,
  userId: string,
): Promise<SpaceRole | null> {
  const { data } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role?: SpaceRole } | null)?.role ?? null;
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
function forbidden(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "forbidden", message: msg }] },
    { status: 403 },
  );
}
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "Space not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}
