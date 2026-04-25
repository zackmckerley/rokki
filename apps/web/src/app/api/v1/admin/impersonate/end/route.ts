import { NextResponse, type NextRequest } from "next/server";
import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { createClient } from "@/lib/supabase/server";
import {
  RING_COOKIE,
  parseRing,
  refreshTokenFor,
  ringCookieOptions,
  serializeRing,
  addToRing,
} from "@/lib/account-ring";
import { emitEvent } from "@/lib/events";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * POST /api/v1/auth/impersonate/end
 *
 * If the current session is the target of an open impersonation_events
 * row (the admin previously impersonated this user), swap back to the
 * admin's own session via the account ring + close the audit row.
 *
 * Lives under /admin even though any authenticated user can call it
 * for themselves — the route gates by checking the impersonation log,
 * not by requireAdmin (the impersonated user might NOT be admin).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
      { status: 401 },
    );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    return NextResponse.json(
      {
        errors: [
          {
            code: "config_error",
            message: "Service role not configured.",
          },
        ],
      },
      { status: 500 },
    );

  const admin = createAdminClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find the most recent open impersonation row where THIS user is the
  // target. The admin who started it is the one we want to swap back to.
  const { data: openRow } = await admin
    .from("impersonation_events")
    .select("id, admin_user_id, started_at")
    .eq("target_user_id", user.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!openRow)
    return NextResponse.json(
      {
        errors: [
          {
            code: "not_impersonated",
            message: "No open impersonation session for this user.",
          },
        ],
      },
      { status: 400 },
    );
  const { id: rowId, admin_user_id: adminId } = openRow as {
    id: string;
    admin_user_id: string;
  };

  // Look the admin's refresh token up in the ring.
  const ring = parseRing(request.cookies.get(RING_COOKIE)?.value);
  const adminRefresh = refreshTokenFor(ring, adminId);
  if (!adminRefresh)
    return NextResponse.json(
      {
        errors: [
          {
            code: "ring_missing",
            message:
              "The admin's session isn't in this browser's ring. Sign in as them again.",
          },
        ],
      },
      { status: 410 },
    );

  // Mint a fresh admin session and bind it to the response.
  const response = NextResponse.json({ data: { ended: true } });
  const ssr = createServerClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const { data: refreshed, error } = await ssr.auth.refreshSession({
    refresh_token: adminRefresh,
  });
  if (error || !refreshed?.session || !refreshed.user)
    return NextResponse.json(
      {
        errors: [
          {
            code: "session_expired",
            message:
              "The admin's session expired. Sign in again to refresh it.",
          },
        ],
      },
      { status: 401 },
    );
  await ssr.auth.setSession({
    access_token: refreshed.session.access_token,
    refresh_token: refreshed.session.refresh_token,
  });

  // Persist the rotated refresh token back to the ring.
  const updated = addToRing(ring, {
    user_id: refreshed.user.id,
    email: refreshed.user.email ?? "",
    refresh_token: refreshed.session.refresh_token,
  });
  response.cookies.set(RING_COOKIE, serializeRing(updated), ringCookieOptions);

  // Close the audit row.
  await admin
    .from("impersonation_events")
    .update({ ended_at: new Date().toISOString() } as never)
    .eq("id", rowId);

  void emitEvent("admin.impersonation.ended", {
    actor_id: adminId,
    entity_type: "user",
    entity_id: user.id,
    payload: {},
  });

  return response;
}
