import { NextResponse, type NextRequest } from "next/server";
import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import {
  RING_COOKIE,
  addToRing,
  parseRing,
  ringCookieOptions,
  serializeRing,
} from "@/lib/account-ring";
import { rateLimitCheck, rateLimitToken } from "@/lib/ratelimit";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * POST /api/v1/auth/accounts/add
 *   { username?, email?, password }
 *
 * Sign in to a *second* account without losing the current one. On success:
 *   1. The new session becomes the active sb-* cookie (browser is now
 *      acting as the new account).
 *   2. The previous account stays in the ring so the user can switch back.
 *
 * Both username (admin) and email work, same alias map as
 * /api/v1/auth/password-login.
 */

const USERNAME_MAP: Record<string, string> = {
  admin: "admin@rokki.local",
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    email?: string;
    password?: string;
  };
  const password = body.password ?? "";
  const rawUsername = (body.username ?? "").trim().toLowerCase();
  let email = body.email?.trim().toLowerCase();
  if (!email) {
    if (!rawUsername) return bad("username or email required");
    email = USERNAME_MAP[rawUsername];
    if (!email) return forbidden("That username doesn't have a password login.");
  }
  if (!password || password.length < 6) return bad("password required");

  // Rate limit (same as password-login).
  const rl = await rateLimitCheck({
    bucket: "password_login",
    token: rateLimitToken(request, email),
    max: 10,
    windowSeconds: 600,
  });
  if (!rl.ok) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "rate_limited",
            message: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.`,
          },
        ],
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  // 1. Validate credentials with an anon client that does NOT touch our
  // cookie store yet. We need the raw session (refresh_token) to add to
  // the ring before we swap the active cookie.
  const anon = createAnonClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data?.session || !data.user) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "invalid_credentials",
            message: "Username or password is incorrect.",
          },
        ],
      },
      { status: 401 },
    );
  }

  // 2. Build the response and bind cookies to it. We'll write the new
  // active session via the SSR client AND append both old + new accounts
  // to the ring.
  const response = NextResponse.json({
    data: {
      added_user_id: data.user.id,
      email: data.user.email,
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

  // 3. Capture the *previous* session (if any) so we can preserve it in
  // the ring. Has to happen BEFORE we overwrite the cookie.
  let previous: { user_id: string; email: string; refresh_token: string } | null =
    null;
  try {
    const { data: prev } = await ssr.auth.getSession();
    if (prev?.session?.user && prev.session.refresh_token) {
      previous = {
        user_id: prev.session.user.id,
        email: prev.session.user.email ?? "",
        refresh_token: prev.session.refresh_token,
      };
    }
  } catch {
    // No previous session — first sign-in.
  }

  // 4. Set the new session as active.
  const { error: setErr } = await ssr.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (setErr) {
    return NextResponse.json(
      {
        errors: [
          { code: "internal_error", message: `setSession: ${setErr.message}` },
        ],
      },
      { status: 500 },
    );
  }

  // 5. Update the ring with both accounts (previous if any + new).
  let ring = parseRing(request.cookies.get(RING_COOKIE)?.value);
  if (previous && previous.user_id !== data.user.id) {
    ring = addToRing(ring, previous);
  }
  ring = addToRing(ring, {
    user_id: data.user.id,
    email: data.user.email ?? email,
    refresh_token: data.session.refresh_token,
  });

  response.cookies.set(RING_COOKIE, serializeRing(ring), ringCookieOptions);

  return response;
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
