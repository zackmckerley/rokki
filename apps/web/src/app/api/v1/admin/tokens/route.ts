import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";
import { revokeSessions } from "@/lib/revocations";

/**
 * GET /api/v1/admin/tokens
 *   Lists every access_tokens row with the owner's email joined.
 *   ?stale_days= filter to tokens unused for at least N days.
 *
 * DELETE /api/v1/admin/tokens?id=<id>
 *   Revokes a token by setting revoked_at, and fires session_revocations
 *   so the user's clients log out.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const staleDays = parseInt(url.searchParams.get("stale_days") ?? "0", 10);

  let query = admin
    .from("access_tokens")
    .select(
      "id, name, token_prefix, scopes, user_id, created_at, last_used_at, expires_at, revoked_at",
    )
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (staleDays > 0) {
    const cutoff = new Date(Date.now() - staleDays * 86_400_000).toISOString();
    query = query.or(`last_used_at.is.null,last_used_at.lt.${cutoff}`);
  }

  const { data, error } = await query;
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );
  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    token_prefix: string;
    scopes: string[];
    user_id: string;
    created_at: string;
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
  }>;
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: authList } = await admin.auth.admin.listUsers({
    perPage: 200,
    page: 1,
  });
  const emailMap = new Map(
    (authList?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  return NextResponse.json({
    data: rows.map((r) => ({ ...r, email: emailMap.get(r.user_id) ?? "" })),
  });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id)
    return NextResponse.json(
      { errors: [{ code: "invalid_request", message: "id query required" }] },
      { status: 400 },
    );

  const { data: token } = await admin
    .from("access_tokens")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();
  if (!token)
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "Token not found" }] },
      { status: 404 },
    );
  const userId = (token as { user_id: string }).user_id;

  const { error } = await admin
    .from("access_tokens")
    .update({ revoked_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  await revokeSessions(admin, { userId, reason: "token_revoked" });

  void emitEvent("admin.token.revoked", {
    actor_id: actorId,
    entity_type: "token",
    entity_id: id,
    payload: { user_id: userId },
  });

  return new NextResponse(null, { status: 204 });
}
