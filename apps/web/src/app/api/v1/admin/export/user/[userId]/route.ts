import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

interface Props {
  params: Promise<{ userId: string }>;
}

/**
 * GET /api/v1/admin/export/user/:userId
 *
 * GDPR subject-access bundle. Returns a JSON document with everything we
 * hold about this user: profile, memberships, tasks they created, files
 * they uploaded, comments they wrote, tokens, and admin notes.
 */
export async function GET(request: NextRequest, { params }: Props) {
  const { userId } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const { data: authRes } = await admin.auth.admin.getUserById(userId);
  if (!authRes?.user)
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "User not found" }] },
      { status: 404 },
    );

  const [
    { data: profile },
    { data: spaceMembers },
    { data: terminalMembers },
    { data: tasks },
    { data: files },
    { data: comments },
    { data: tokens },
    { data: notes },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("space_members")
      .select("space_id, role, joined_at, spaces(slug, name)")
      .eq("user_id", userId),
    admin
      .from("terminal_members")
      .select("terminal_id, role, added_at, terminals(ticker, name)")
      .eq("user_id", userId),
    admin
      .from("tasks")
      .select("id, title, status, priority, due_date, created_at, terminal_id")
      .eq("created_by", userId)
      .limit(2000),
    admin
      .from("files")
      .select("id, filename, folder, size_bytes, uploaded_at, terminal_id")
      .eq("uploaded_by", userId)
      .is("deleted_at", null)
      .limit(2000),
    admin
      .from("comments")
      .select("id, body, created_at")
      .eq("created_by", userId)
      .limit(2000),
    admin
      .from("access_tokens")
      .select(
        "id, name, token_prefix, scopes, created_at, last_used_at, expires_at, revoked_at",
      )
      .eq("user_id", userId),
    admin
      .from("admin_notes")
      .select("id, body, author_user_id, created_at")
      .eq("target_user_id", userId)
      .limit(500),
  ]);

  const bundle = {
    exported_at: new Date().toISOString(),
    auth_user: {
      id: authRes.user.id,
      email: authRes.user.email,
      created_at: authRes.user.created_at,
      last_sign_in_at: authRes.user.last_sign_in_at,
      email_confirmed_at: authRes.user.email_confirmed_at,
    },
    profile,
    space_memberships: spaceMembers ?? [],
    terminal_memberships: terminalMembers ?? [],
    tasks_created: tasks ?? [],
    files_uploaded: files ?? [],
    comments_authored: comments ?? [],
    access_tokens: tokens ?? [],
    admin_notes: notes ?? [],
  };

  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="rokki-user-${userId}.json"`,
    },
  });
}
