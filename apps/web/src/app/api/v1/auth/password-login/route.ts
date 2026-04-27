import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@rokki/db";
import { rateLimitCheck, rateLimitToken } from "@/lib/ratelimit";
import {
  RING_COOKIE,
  addToRing,
  parseRing,
  ringCookieOptions,
  serializeRing,
} from "@/lib/account-ring";
import { cryptoEnabled } from "@/lib/token-crypto";
import { withObservability } from "@/lib/observability";
import { getEmailForUsername } from "@/lib/usernames";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * POST /api/v1/auth/password-login  { username?, email?, password }
 *
 * A password login that maps a short username (e.g. "admin") to a
 * pseudo-email (admin@rokki.local) before calling Supabase's
 * signInWithPassword. Rate-limited just like the magic-link sender.
 *
 * Why have this at all? Magic-link email is our primary flow, but a
 * platform admin needs a quick, no-email way in — both for local dev
 * and for emergency production access. The endpoint is narrow: the
 * username → email map only accepts allow-listed usernames, so a
 * random "username" spam attempt can't brute-force arbitrary inboxes.
 *
 * The allow-list itself lives in `@/lib/usernames` so the admin user
 * page can do the reverse lookup without importing this route file.
 *
 * Disable in production by setting DISABLE_PASSWORD_LOGIN=true.
 */

async function handlePost(request: NextRequest) {
  if (process.env.DISABLE_PASSWORD_LOGIN === "true") {
    return NextResponse.json(
      {
        errors: [
          {
            code: "not_found",
            message: "Password login is disabled on this deployment.",
          },
        ],
      },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    email?: string;
    password?: string;
    /** Default true. When false the auth cookies are scoped to the
     *  browser session and disappear on close. */
    remember?: boolean;
  };
  const password = body.password ?? "";
  const rawUsername = (body.username ?? "").trim().toLowerCase();
  // Treat undefined as "remember" so the historical behaviour is the
  // default. Only an explicit false from the form opts the user out.
  const remember = body.remember !== false;
  let email = body.email?.trim().toLowerCase();

  if (!email) {
    if (!rawUsername) {
      return bad("username or email required");
    }
    email = getEmailForUsername(rawUsername);
    if (!email) {
      return forbidden("That username doesn't have a password login.");
    }
  }

  if (!password || password.length < 6) {
    return bad("password required");
  }

  // Tighter than magic-link: 10 attempts / 10 minutes per (IP, email).
  // Password guessing is more dangerous than magic-link replay.
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

  // Build a response up-front so the Supabase client can bind cookies to it.
  const response = NextResponse.json({ data: { signed_in: true } });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // When the user opted out of "Keep me signed in", strip
            // maxAge / expires so the browser treats every Supabase
            // auth cookie as session-scoped (cleared on browser close).
            // Other cookie attributes (httpOnly, secure, sameSite, path)
            // come from Supabase and stay intact.
            const finalOptions: CookieOptions = remember
              ? options ?? {}
              : { ...(options ?? {}), maxAge: undefined, expires: undefined };
            response.cookies.set(name, value, finalOptions);
          });
        },
      },
    },
  );

  const { data: signIn, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Keep the error surface uniform — no "user not found" vs "bad
    // password" leak.
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

  // Append the new account to the ring so the user can switch back to
  // it later. Best-effort: if TOKEN_ENCRYPTION_KEY is unset we skip the
  // ring write rather than fail the sign-in (the ring is a convenience,
  // not a security boundary).
  if (
    cryptoEnabled() &&
    signIn?.session?.refresh_token &&
    signIn.user
  ) {
    try {
      const ring = parseRing(request.cookies.get(RING_COOKIE)?.value);
      const next = addToRing(ring, {
        user_id: signIn.user.id,
        email: signIn.user.email ?? email,
        refresh_token: signIn.session.refresh_token,
      });
      response.cookies.set(
        RING_COOKIE,
        serializeRing(next),
        ringCookieOptions,
      );
    } catch {
      // swallow — ring is best-effort
    }
  }

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

export const POST = withObservability(handlePost, "POST /api/v1/auth/password-login");
