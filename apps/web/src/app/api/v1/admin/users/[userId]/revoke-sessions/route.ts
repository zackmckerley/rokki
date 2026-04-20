import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeSessions } from "@/lib/revocations";

interface Props {
  params: Promise<{ userId: string }>;
}

/**
 * POST /api/v1/admin/users/:userId/revoke-sessions
 *
 * Fires a revocation row that the `SessionGuard` listens for on every
 * logged-in client belonging to this user — they sign out within ~seconds.
 * Platform admins only. Prevented from signing themselves out for obvious
 * reasons.
 */
export async function POST(_req: NextRequest, { params }: Props) {
  const { userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data: me } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!(me as { is_platform_admin?: boolean } | null)?.is_platform_admin) {
    return forbidden("platform admins only");
  }

  if (userId === user.id)
    return bad("to sign yourself out, use the normal sign-out flow");

  await revokeSessions(supabase, {
    userId,
    reason: "admin_action",
  });

  return NextResponse.json({ data: { revoked: true } });
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
