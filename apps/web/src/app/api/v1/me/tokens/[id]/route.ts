import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/v1/me/tokens/:id — revoke.
 * Active MCP sessions using the token are disconnected within 30s
 * (MCP server re-validates on every keep-alive ping).
 */
export async function DELETE(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { error } = await supabase
    .from("access_tokens")
    // @ts-expect-error Phase 0 — update type collapses to never
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: "user_revoked",
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return internal(error.message);
  return new NextResponse(null, { status: 204 });
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}
