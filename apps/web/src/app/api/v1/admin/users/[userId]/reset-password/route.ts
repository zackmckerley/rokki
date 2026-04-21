import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";
import { revokeSessions } from "@/lib/revocations";

interface Props {
  params: Promise<{ userId: string }>;
}

/**
 * POST /api/v1/admin/users/:userId/reset-password
 *   { password?: string, send_email?: boolean }
 *
 * Two modes:
 *   - password set by admin — writes the hash, revokes sessions
 *   - email a reset link   — generates a recovery link (Mailpit/Supabase mails it)
 * Both can be used together.
 */
export async function POST(request: NextRequest, { params }: Props) {
  const { userId } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
    send_email?: boolean;
  };

  if (!body.password && !body.send_email)
    return NextResponse.json(
      {
        errors: [
          {
            code: "invalid_request",
            message: "Pass a new password, or set send_email: true.",
          },
        ],
      },
      { status: 400 },
    );

  if (body.password && body.password.length < 8)
    return NextResponse.json(
      {
        errors: [
          { code: "invalid_request", message: "password must be ≥ 8 chars" },
        ],
      },
      { status: 400 },
    );

  const { data: target } = await admin.auth.admin.getUserById(userId);
  if (!target?.user)
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "User not found" }] },
      { status: 404 },
    );

  if (body.password) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: body.password,
    });
    if (error)
      return NextResponse.json(
        { errors: [{ code: "internal_error", message: error.message }] },
        { status: 500 },
      );
    await revokeSessions(admin, { userId, reason: "admin_action" });
  }

  if (body.send_email && target.user.email) {
    try {
      await admin.auth.admin.generateLink({
        type: "recovery",
        email: target.user.email,
        options: {
          redirectTo: `${
            process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
          }/auth/callback`,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "generate link failed";
      return NextResponse.json(
        { errors: [{ code: "internal_error", message: msg }] },
        { status: 500 },
      );
    }
  }

  void emitEvent("admin.user.password_reset", {
    actor_id: actorId,
    entity_type: "user",
    entity_id: userId,
    payload: {
      method: body.password ? "set_by_admin" : "email_link",
    },
  });

  return NextResponse.json({ data: { reset: true } });
}
