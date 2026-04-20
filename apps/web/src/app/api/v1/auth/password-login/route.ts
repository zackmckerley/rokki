import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@rokki/db";
import { rateLimitCheck, rateLimitToken } from "@/lib/ratelimit";

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
 * Disable in production by setting DISABLE_PASSWORD_LOGIN=true.
 */

const USERNAME_MAP: Record<string, string> = {
  admin: "admin@rokki.local",
};

export async function POST(request: NextRequest) {
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
  };
  const password = body.password ?? "";
  const rawUsername = (body.username ?? "").trim().toLowerCase();
  let email = body.email?.trim().toLowerCase();

  if (!email) {
    if (!rawUsername) {
      return bad("username or email required");
    }
    email = USERNAME_MAP[rawUsername];
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
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({
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
