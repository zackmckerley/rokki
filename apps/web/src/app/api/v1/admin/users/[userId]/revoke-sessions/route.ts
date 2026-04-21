import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { revokeSessions } from "@/lib/revocations";
import { emitEvent } from "@/lib/events";

interface Props {
  params: Promise<{ userId: string }>;
}

/**
 * POST /api/v1/admin/users/:userId/revoke-sessions
 *
 * Fires a revocation row that the `SessionGuard` listens for on every
 * logged-in client belonging to this user — they sign out within ~seconds.
 */
export async function POST(request: NextRequest, { params }: Props) {
  const { userId } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  if (userId === actorId) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "invalid_request",
            message: "to sign yourself out, use the normal sign-out flow",
          },
        ],
      },
      { status: 400 },
    );
  }

  await revokeSessions(admin, { userId, reason: "admin_action" });

  void emitEvent("admin.user.sessions_revoked", {
    actor_id: actorId,
    entity_type: "user",
    entity_id: userId,
    payload: {},
  });

  return NextResponse.json({ data: { revoked: true } });
}
