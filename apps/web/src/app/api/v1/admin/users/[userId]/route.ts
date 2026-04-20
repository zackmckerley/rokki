import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ userId: string }>;
}

/**
 * PATCH /api/v1/admin/users/:userId  { is_platform_admin?: boolean, full_name? }
 *
 * Platform-admin only. Promotes / demotes or edits basic profile fields.
 * The caller cannot demote themselves if they're the only admin — that
 * would brick the platform.
 */
export async function PATCH(request: NextRequest, { params }: Props) {
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

  const body = (await request.json().catch(() => ({}))) as {
    is_platform_admin?: boolean;
    full_name?: string | null;
  };

  const patch: Record<string, unknown> = {};
  if (typeof body.is_platform_admin === "boolean") {
    if (userId === user.id && body.is_platform_admin === false) {
      const { count } = await supabase
        .from("profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("is_platform_admin", true);
      if ((count ?? 0) <= 1)
        return bad("promote another user to admin before demoting yourself");
    }
    patch.is_platform_admin = body.is_platform_admin;
  }
  if (typeof body.full_name === "string" || body.full_name === null) {
    patch.full_name = body.full_name;
  }

  if (Object.keys(patch).length === 0) return bad("no patchable fields");
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("profiles")
    // @ts-expect-error Phase 0 — update type collapses to never
    .update(patch)
    .eq("user_id", userId);

  if (error) return internal(error.message);
  return NextResponse.json({ data: { user_id: userId, ...patch } });
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
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}
