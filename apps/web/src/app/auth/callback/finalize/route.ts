import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database, OrgRole, ProjectRole } from "@rokki/db";
import { safeRedirectPath } from "@/lib/safe-redirect";

/**
 * Second leg of the invite / magic-link flow. The hash-fragment shim in
 * /auth/callback sets the session client-side then hits this route. We use the
 * session to identify the user, then run the invite-acceptance logic with the
 * **service-role client** — because the user themselves doesn't yet have
 * project-manager RLS permission to insert themselves into project_members.
 *
 * The email match on the invite row is what authorizes the insert: we only
 * accept invites whose `email` equals the signed-in user's verified email.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const redirectTo = safeRedirectPath(searchParams.get("redirect_to"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(`${origin}/login?error=no_session`);
  }

  await acceptPendingInvites(user.id, user.email.toLowerCase());
  return NextResponse.redirect(`${origin}${redirectTo}`);
}

interface InviteRow {
  id: string;
  email: string;
  space_id: string | null;
  terminal_id: string | null;
  role: string;
  invited_by: string;
}

async function acceptPendingInvites(userId: string, email: string) {
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data } = await admin
    .from("invites")
    .select("id, email, space_id, terminal_id, role, invited_by")
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString());

  const invites = (data ?? []) as InviteRow[];
  if (invites.length === 0) return 0;

  const db = admin as unknown as {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<unknown>;
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<unknown>;
      };
    };
  };

  for (const invite of invites) {
    // Double-check: email on the invite must equal the signed-in email.
    if (invite.email.toLowerCase() !== email) continue;

    if (invite.space_id) {
      await db.from("space_members").insert({
        space_id: invite.space_id,
        user_id: userId,
        role: invite.role as OrgRole,
      });
    }
    if (invite.terminal_id) {
      await db.from("terminal_members").insert({
        terminal_id: invite.terminal_id,
        user_id: userId,
        role: invite.role as ProjectRole,
        added_by: invite.invited_by,
      });
    }
    await db
      .from("invites")
      .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
      .eq("id", invite.id);
  }
  return invites.length;
}
