import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/admin/invitations/:id/resend
 *   Re-issues a magic link to the invited address. Token in `invites`
 *   stays the same so /auth/callback's invite-acceptance still works.
 */
export async function POST(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const { data: invite } = await admin
    .from("invites")
    .select("id, email, space_id, terminal_id")
    .eq("id", id)
    .maybeSingle();
  if (!invite)
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "Invite not found" }] },
      { status: 404 },
    );
  const i = invite as {
    id: string;
    email: string;
    space_id: string | null;
    terminal_id: string | null;
  };

  const redirect =
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback`;

  try {
    await admin.auth.admin.inviteUserByEmail(i.email, { redirectTo: redirect });
  } catch {
    // 422 means the user already exists in Supabase — generate a magic link instead.
    try {
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: i.email,
        options: { redirectTo: redirect },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "send failed";
      return NextResponse.json(
        { errors: [{ code: "internal_error", message: msg }] },
        { status: 500 },
      );
    }
  }

  void emitEvent("admin.invitation.resent", {
    actor_id: actorId,
    space_id: i.space_id ?? undefined,
    terminal_id: i.terminal_id ?? undefined,
    entity_type: "invite",
    entity_id: id,
    payload: { email: i.email },
  });

  return NextResponse.json({ data: { resent: true } });
}
