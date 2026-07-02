import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { createClient } from "@/lib/supabase/server";
import { validateBearer, hasScope } from "@/lib/api-auth";

export interface AdminContext {
  /** The admin user's auth id. */
  userId: string;
  /** The admin user's email. */
  email: string;
  /** Service-role client, bypasses RLS — the admin's job is to bypass. */
  admin: ReturnType<typeof createAdminClient<Database>>;
}

/**
 * Guard every `/api/v1/admin/*` route handler. Returns an `AdminContext`
 * on success, or a NextResponse with 401/403 you should return immediately.
 *
 *   const gate = await requireAdmin(request);
 *   if ("status" in gate) return gate; // early bail
 *   const { userId, admin } = gate;
 *
 * Accepts both cookie sessions and `Authorization: Bearer rk_...` tokens
 * whose owner has `profiles.is_platform_admin = true`. We always return a
 * service-role client so the caller can make cross-tenant queries without
 * wrestling RLS — that's the whole point of admin tooling.
 */
export async function requireAdmin(
  request: NextRequest,
): Promise<AdminContext | NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "config_error",
            message: "Supabase service key not configured.",
          },
        ],
      },
      { status: 500 },
    );
  }

  const admin = createAdminClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Try bearer first — it short-circuits a cookie read if present.
  const bearer = await validateBearer(request);
  let userId: string | undefined;
  let email: string | undefined;

  if (bearer) {
    // A PAT may only drive admin tooling if it carries the `admin` scope —
    // otherwise a narrow read/write token owned by an admin could perform
    // destructive cross-tenant operations.
    if (!hasScope(bearer, "admin")) {
      return NextResponse.json(
        {
          errors: [
            {
              code: "forbidden",
              message: "This token lacks the required `admin` scope.",
            },
          ],
        },
        { status: 403 },
      );
    }
    userId = bearer.userId;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      email = user.email ?? undefined;
    }
  }

  if (!userId) return unauth();

  const { data } = await admin
    .from("profiles")
    .select("is_platform_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (!(data as { is_platform_admin?: boolean } | null)?.is_platform_admin) {
    return forbidden();
  }

  if (!email) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    email = u.user?.email ?? undefined;
  }

  return { userId, email: email ?? "", admin };
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function forbidden() {
  return NextResponse.json(
    {
      errors: [
        { code: "forbidden", message: "Platform administrator role required." },
      ],
    },
    { status: 403 },
  );
}
