import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";
import { revokeSessions } from "@/lib/revocations";

interface Props {
  params: Promise<{ userId: string }>;
}

const TZ_RE = /^[A-Za-z]+(?:[_+\-][A-Za-z0-9]+)*(?:\/[A-Za-z]+(?:[_+\-][A-Za-z0-9]+)*)*$/;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

/**
 * GET    /api/v1/admin/users/:userId                — full user detail
 * PATCH  /api/v1/admin/users/:userId                — { full_name?, timezone?, email?,
 *                                                      email_confirm?, is_platform_admin? }
 * DELETE /api/v1/admin/users/:userId                — hard delete (cascades)
 */
export async function GET(request: NextRequest, { params }: Props) {
  const { userId } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const [{ data: authRes }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin
      .from("profiles")
      .select(
        "user_id, full_name, avatar_url, timezone, settings, preferences, is_platform_admin, created_at, updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!authRes?.user) return notFound();

  const [{ data: spaceMembers }, { data: terminalMembers }, { data: tokens }] =
    await Promise.all([
      admin
        .from("space_members")
        .select("space_id, role, joined_at, spaces(slug, name)")
        .eq("user_id", userId),
      admin
        .from("terminal_members")
        .select("terminal_id, role, added_at, terminals(ticker, name)")
        .eq("user_id", userId),
      admin
        .from("access_tokens")
        .select(
          "id, name, token_prefix, scopes, created_at, last_used_at, expires_at, revoked_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

  return NextResponse.json({
    data: {
      user: {
        id: authRes.user.id,
        email: authRes.user.email,
        created_at: authRes.user.created_at,
        last_sign_in_at: authRes.user.last_sign_in_at,
        email_confirmed_at: authRes.user.email_confirmed_at,
        banned_until:
          (authRes.user as unknown as { banned_until?: string | null })
            .banned_until ?? null,
      },
      profile: profile ?? null,
      space_memberships: spaceMembers ?? [],
      terminal_memberships: terminalMembers ?? [],
      tokens: tokens ?? [],
    },
  });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const { userId } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    full_name?: string | null;
    timezone?: string | null;
    email?: string;
    email_confirm?: boolean;
    is_platform_admin?: boolean;
  };

  // Prevent the actor from accidentally demoting themselves out of the
  // only admin slot.
  if (body.is_platform_admin === false && userId === actorId) {
    const { count } = await admin
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("is_platform_admin", true);
    if ((count ?? 0) <= 1)
      return bad("promote another user to admin before demoting yourself");
  }

  // 1) auth.users mutations (email, email_confirm)
  const authPatch: Record<string, unknown> = {};
  if (typeof body.email === "string") {
    const nextEmail = body.email.trim().toLowerCase();
    if (!EMAIL_RE.test(nextEmail)) return bad("invalid email");
    authPatch.email = nextEmail;
    // Default: require re-verification unless explicitly confirmed.
    authPatch.email_confirm = body.email_confirm === true;
  } else if (typeof body.email_confirm === "boolean") {
    authPatch.email_confirm = body.email_confirm;
  }

  if (Object.keys(authPatch).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(
      userId,
      authPatch as never,
    );
    if (error) return internal(error.message);
  }

  // 2) profile mutations
  const profPatch: Record<string, unknown> = {};
  if (body.full_name !== undefined) {
    if (body.full_name && body.full_name.length > 120)
      return bad("full_name must be ≤ 120 chars");
    profPatch.full_name = body.full_name;
  }
  if (body.timezone !== undefined) {
    if (body.timezone && !TZ_RE.test(body.timezone))
      return bad("invalid timezone");
    profPatch.timezone = body.timezone;
  }
  if (typeof body.is_platform_admin === "boolean") {
    profPatch.is_platform_admin = body.is_platform_admin;
  }
  if (Object.keys(profPatch).length > 0) {
    profPatch.updated_at = new Date().toISOString();
    const { error } = await admin
      .from("profiles")
      .update(profPatch as never)
      .eq("user_id", userId);
    if (error) return internal(error.message);
  }

  void emitEvent("admin.user.updated", {
    actor_id: actorId,
    entity_type: "user",
    entity_id: userId,
    payload: {
      fields: [...Object.keys(authPatch), ...Object.keys(profPatch)],
    },
  });

  return NextResponse.json({ data: { user_id: userId } });
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const { userId } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  if (userId === actorId) return bad("cannot delete yourself");

  // Revoke sessions first so the user can't act mid-delete.
  await revokeSessions(admin, { userId, reason: "admin_action" });

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return internal(error.message);

  void emitEvent("admin.user.deleted", {
    actor_id: actorId,
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
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "User not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}
