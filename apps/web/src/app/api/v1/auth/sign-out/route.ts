import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  RING_COOKIE,
  parseRing,
  publicRing,
  removeFromRing,
  refreshTokenFor,
  ringCookieOptions,
  serializeRing,
} from "@/lib/account-ring";
import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import type { Database } from "@rokki/db";
import { withObservability } from "@/lib/observability";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * POST /api/v1/auth/sign-out
 *   ?scope=current  (default) Sign out only the active account. If
 *                   another account is in the ring, switch to it
 *                   automatically. Otherwise destroy the session.
 *   ?scope=all      Sign out every account and clear the ring.
 *
 * Both modes also call supabase.auth.signOut so the access token gets
 * invalidated server-side.
 */
async function handlePost(request: NextRequest) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "all" ? "all" : "current";

  const supabase = await createClient();
  const {
    data: { user: activeUser },
  } = await supabase.auth.getUser();

  let ring = parseRing(request.cookies.get(RING_COOKIE)?.value);

  // Sign out from Supabase first so the access token is invalidated.
  // signOut() clears cookies on the bound response; we'll rebuild
  // afterwards if we're switching to another ring entry.
  await supabase.auth.signOut();

  if (scope === "all") {
    const response = NextResponse.json({
      data: { signed_out: true, remaining: 0, switched_to: null },
    });
    response.cookies.set(RING_COOKIE, "", { ...ringCookieOptions, maxAge: 0 });
    // signOut already cleared the sb-* cookie on the supabase client's
    // bound response, but that response is separate from this one. Be
    // explicit: clear by setting empty values.
    clearSupabaseCookies(request, response);
    return response;
  }

  // scope=current: drop the active account from the ring.
  if (activeUser) {
    const { ring: next } = removeFromRing(ring, activeUser.id);
    ring = next;
  }

  if (ring.length === 0) {
    const response = NextResponse.json({
      data: { signed_out: true, remaining: 0, switched_to: null },
    });
    response.cookies.set(RING_COOKIE, "", { ...ringCookieOptions, maxAge: 0 });
    clearSupabaseCookies(request, response);
    return response;
  }

  // Switch to the most recently added account.
  const next = ring[0]!;
  const refresh = refreshTokenFor(ring, next.user_id);
  if (!refresh) {
    // Couldn't decrypt — give up and clear everything to avoid a stuck UI.
    const response = NextResponse.json({
      data: {
        signed_out: true,
        remaining: 0,
        switched_to: null,
        notice: "Could not auto-switch; please sign in again.",
      },
    });
    response.cookies.set(RING_COOKIE, "", { ...ringCookieOptions, maxAge: 0 });
    clearSupabaseCookies(request, response);
    return response;
  }

  const response = NextResponse.json({
    data: {
      signed_out: true,
      remaining: ring.length,
      switched_to: { user_id: next.user_id, email: next.email },
      ring: publicRing(ring),
    },
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
  await ssr.auth.refreshSession({ refresh_token: refresh });

  response.cookies.set(RING_COOKIE, serializeRing(ring), ringCookieOptions);
  return response;
}

/**
 * Clear every cookie that looks like a Supabase auth cookie. Names vary
 * by Supabase URL host; we match prefixes.
 */
function clearSupabaseCookies(
  request: NextRequest,
  response: NextResponse,
): void {
  for (const cookie of request.cookies.getAll()) {
    if (
      cookie.name.startsWith("sb-") &&
      cookie.name.includes("auth-token")
    ) {
      response.cookies.set(cookie.name, "", {
        path: "/",
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
      });
    }
  }
}

export const POST = withObservability(handlePost, "POST /api/v1/auth/sign-out");
