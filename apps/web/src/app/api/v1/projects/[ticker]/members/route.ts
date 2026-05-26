import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";
import type { Database, ProjectRole } from "@rokki/db";
import crypto from "node:crypto";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * GET  /api/v1/projects/:ticker/members               — list members + pending invites
 * POST /api/v1/projects/:ticker/members { email, role } — invite by email
 *
 * The invite flow:
 *   1. Caller POSTs email + role. We check caller is owner/manager of the space.
 *   2. If the email already belongs to a Rokki user: add directly to project_members.
 *   3. Otherwise: create an invites row AND send a Supabase Auth magic link
 *      scoped so that when the recipient clicks it, /auth/callback auto-accepts
 *      the invite (see apps/web/src/app/auth/callback/route.ts).
 */
async function handleGet(_req: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const project = await resolveProject(supabase, ticker);
  if (!project) return notFound();

  const [{ data: rawMembers }, { data: invites }] = await Promise.all([
    supabase
      .from("terminal_members")
      .select("user_id, role, added_at")
      .eq("terminal_id", project.id)
      .order("added_at", { ascending: true }),
    supabase
      .from("invites")
      .select("id, email, role, invited_at, expires_at")
      .eq("terminal_id", project.id)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("invited_at", { ascending: false }),
  ]);

  const memberRows =
    (rawMembers ?? []) as { user_id: string; role: string; added_at: string }[];

  // profiles has no FK from project_members (project_members.user_id → auth.users).
  // Fetch profile rows separately and merge.
  const userIds = memberRows.map((m) => m.user_id);
  const { data: profileRows } = userIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url, timezone")
        .in("user_id", userIds)
    : { data: [] };

  const profileMap = new Map(
    (
      (profileRows ?? []) as {
        user_id: string;
        full_name: string | null;
        avatar_url: string | null;
        timezone: string | null;
      }[]
    ).map((p) => [p.user_id, p]),
  );

  const members = memberRows.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    added_at: m.added_at,
    profiles: profileMap.get(m.user_id) ?? null,
  }));

  return NextResponse.json({
    data: {
      members,
      pending_invites: invites ?? [],
    },
  });
}

async function handlePost(request: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const project = await resolveProject(supabase, ticker);
  if (!project) return notFound();

  // Caller must be owner or manager (or org admin) to invite
  const { data: me } = await supabase
    .from("terminal_members")
    .select("role")
    .eq("terminal_id", project.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const myRole = (me as { role: ProjectRole } | null)?.role;
  if (!myRole || !["owner", "manager"].includes(myRole))
    return forbidden("only owners and managers can invite");

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    role?: ProjectRole;
  };
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email))
    return bad("valid email required");

  const role: ProjectRole = body.role ?? "guest";
  const allowedRoles: ProjectRole[] = [
    "owner",
    "manager",
    "architect",
    "gc",
    "lender",
    "family",
    "guest",
  ];
  if (!allowedRoles.includes(role)) return bad("unknown role");

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Is there already a Rokki user with this email? If so, add them directly.
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existing = existingUsers?.users.find(
    (u) => u.email?.toLowerCase() === email,
  );

  if (existing) {
    // If they're already a member, done.
    const { data: already } = await supabase
      .from("terminal_members")
      .select("user_id")
      .eq("terminal_id", project.id)
      .eq("user_id", existing.id)
      .maybeSingle();
    if (!already) {
      await supabase
        .from("terminal_members")
        // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
        .insert({
          terminal_id: project.id,
          user_id: existing.id,
          role,
          added_by: user.id,
        });

      await supabase
        .from("activity")
        // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
        .insert({
          terminal_id: project.id,
          space_id: project.space_id,
          actor_id: user.id,
          action: "member.join",
          entity_type: "user",
          entity_id: existing.id,
          metadata: { email, role },
        });
    }
    return NextResponse.json({ data: { added: true, user_id: existing.id } });
  }

  // Otherwise, create a pending invite + send magic link
  const token = crypto.randomBytes(32).toString("base64url");
  const { error: inviteErr } = await supabase
    .from("invites")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      email,
      terminal_id: project.id,
      role,
      token,
      invited_by: user.id,
    });
  if (inviteErr) return internal(inviteErr.message);

  // inviteUserByEmail creates the auth user AND sends a magic-link email.
  // On click, /auth/callback sees the pending invite row (matched by email)
  // and auto-adds them to project_members — see apps/web/src/app/auth/callback/route.ts.
  const { error: inviteSendErr } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?redirect_to=${encodeURIComponent(`/p/${project.ticker}`)}`,
    },
  );
  if (inviteSendErr) {
    // Fallback: if the user already exists (422), send a magic link instead
    if (inviteSendErr.status === 422) {
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?redirect_to=${encodeURIComponent(`/p/${project.ticker}`)}`,
        },
      });
    }
  }

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: project.id,
      space_id: project.space_id,
      actor_id: user.id,
      action: "member.invite",
      entity_type: "invite",
      metadata: { email, role },
    });

  return NextResponse.json(
    { data: { invited: true, email, role } },
    { status: 201 },
  );
}

async function resolveProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticker: string,
) {
  return resolveTerminalBySegment(supabase, ticker);
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

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/projects/:ticker/members",
);
export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/projects/:ticker/members",
);
