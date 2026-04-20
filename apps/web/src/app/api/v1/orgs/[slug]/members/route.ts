import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events";
import type { Database } from "@rokki/db";
import crypto from "node:crypto";

interface Props {
  params: Promise<{ slug: string }>;
}

type SpaceRole = "owner" | "admin" | "member";

/**
 * GET  /api/v1/orgs/:slug/members                 — list members + pending invites
 * POST /api/v1/orgs/:slug/members  { email, role } — invite by email
 *
 * Space invites are broader than terminal invites: they give the user access
 * to the whole space (and, at "admin" tier, the ability to create terminals).
 * The accept flow lives in /auth/callback — when a pending space_invite row
 * matches the sign-in email, we auto-add them as a space_members row.
 */
const VALID_ROLES: SpaceRole[] = ["owner", "admin", "member"];

export async function GET(_req: NextRequest, { params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const space = await resolveSpace(supabase, slug);
  if (!space) return notFound();

  const { data: members } = await supabase
    .from("space_members")
    .select("user_id, role, joined_at")
    .eq("space_id", space.id)
    .order("joined_at", { ascending: true });

  const memberRows = (members ?? []) as {
    user_id: string;
    role: SpaceRole;
    joined_at: string;
  }[];

  const userIds = memberRows.map((m) => m.user_id);
  const { data: profileRows } = userIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds)
    : { data: [] };
  const profileMap = new Map(
    ((profileRows ?? []) as {
      user_id: string;
      full_name: string | null;
      avatar_url: string | null;
    }[]).map((p) => [p.user_id, p]),
  );

  const { data: invites } = await supabase
    .from("invites")
    .select("id, email, role, invited_at, expires_at")
    .eq("space_id", space.id)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("invited_at", { ascending: false });

  return NextResponse.json({
    data: {
      members: memberRows.map((m) => ({
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        full_name: profileMap.get(m.user_id)?.full_name ?? null,
        avatar_url: profileMap.get(m.user_id)?.avatar_url ?? null,
      })),
      pending_invites: invites ?? [],
    },
  });
}

export async function POST(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const space = await resolveSpace(supabase, slug);
  if (!space) return notFound();

  const { data: me } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", space.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const myRole = (me as { role: SpaceRole } | null)?.role;
  if (myRole !== "owner" && myRole !== "admin")
    return forbidden("only owners or admins can invite to a space");

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    role?: SpaceRole;
  };
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email))
    return bad("valid email required");
  const role: SpaceRole = body.role ?? "member";
  if (!VALID_ROLES.includes(role)) return bad("unknown role");

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existing = existingUsers?.users.find(
    (u) => u.email?.toLowerCase() === email,
  );

  if (existing) {
    const { data: already } = await supabase
      .from("space_members")
      .select("user_id")
      .eq("space_id", space.id)
      .eq("user_id", existing.id)
      .maybeSingle();
    if (!already) {
      const { error } = await supabase
        .from("space_members")
        // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
        .insert({ space_id: space.id, user_id: existing.id, role });
      if (error) return internal(error.message);

      void emitEvent("space.member.added", {
        actor_id: user.id,
        space_id: space.id,
        entity_type: "user",
        entity_id: existing.id,
        payload: { email, role, direct: true },
      });
    }
    return NextResponse.json({
      data: { added: true, user_id: existing.id, role },
    });
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const { error: inviteErr } = await supabase
    .from("invites")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      email,
      space_id: space.id,
      role,
      token,
      invited_by: user.id,
    });
  if (inviteErr) return internal(inviteErr.message);

  const { error: inviteSendErr } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?redirect_to=${encodeURIComponent("/")}`,
    },
  );
  if (inviteSendErr && inviteSendErr.status === 422) {
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?redirect_to=${encodeURIComponent("/")}`,
      },
    });
  }

  void emitEvent("space.member.invited", {
    actor_id: user.id,
    space_id: space.id,
    entity_type: "invite",
    payload: { email, role },
  });

  return NextResponse.json(
    { data: { invited: true, email, role } },
    { status: 201 },
  );
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
