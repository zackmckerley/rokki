import { NextResponse, type NextRequest } from "next/server";
import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import type { Database } from "@rokki/db";
import {
  RING_COOKIE,
  parseRing,
  refreshTokenFor,
  addToRing,
  ringCookieOptions,
  serializeRing,
} from "@/lib/account-ring";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * POST /api/v1/auth/accounts/switch  { user_id }
 *
 * Switches the active session to a different account already in the ring.
 * Uses the stored refresh token to mint a fresh access token via
 * `setSession`, then writes the new sb-* cookie.
 *
 * Updates the ring with whatever fresh refresh token Supabase issues
 * (Supabase rotates them) so the next switch back to this account also
 * works.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    user_id?: string;
  };
  const targetId = body.user_id?.trim();
  if (!targetId)
    return NextResponse.json(
      { errors: [{ code: "invalid_request", message: "user_id required" }] },
      { status: 400 },
    );

  const ring = parseRing(request.cookies.get(RING_COOKIE)?.value);
  const refresh = refreshTokenFor(ring, targetId);
  if (!refresh)
    return NextResponse.json(
      {
        errors: [
          {
            code: "not_found",
            message: "That account isn't in your ring. Sign in to add it.",
          },
        ],
      },
      { status: 404 },
    );

  const response = NextResponse.json({
    data: { switched_to: targetId },
  });

  const ssr = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  );

  // Trade the stored refresh token for a live session. Supabase's
  // refreshSession requires a current session to be set first; pass it
  // via setSession with both fields. The access_token can be a stub (it's
  // immediately exchanged); we pass empty and let refreshSession do the
  // work.
  const { data: refreshed, error } = await ssr.auth.refreshSession({
    refresh_token: refresh,
  });
  if (error || !refreshed?.session || !refreshed.user) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "session_expired",
            message:
              "That account's session expired. Sign in again to refresh it.",
          },
        ],
      },
      { status: 401 },
    );
  }

  if (refreshed.user.id !== targetId) {
    // Defence in depth — should never happen.
    return NextResponse.json(
      {
        errors: [
          { code: "internal_error", message: "session mismatch on switch" },
        ],
      },
      { status: 500 },
    );
  }

  // setSession also writes the cookie.
  await ssr.auth.setSession({
    access_token: refreshed.session.access_token,
    refresh_token: refreshed.session.refresh_token,
  });

  // Update the ring with the rotated refresh token so future switches
  // keep working.
  const updated = addToRing(ring, {
    user_id: refreshed.user.id,
    email: refreshed.user.email ?? "",
    refresh_token: refreshed.session.refresh_token,
  });
  response.cookies.set(RING_COOKIE, serializeRing(updated), ringCookieOptions);

  return response;
}
