import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { rateLimitCheck, rateLimitToken } from "@/lib/ratelimit";

/**
 * POST /api/v1/auth/send-link  { email, redirect_to? }
 *
 * Rate-limited magic-link sender. Caps at 5 attempts per minute per
 * (IP, email) pair — tight enough to stop scripted abuse, loose enough
 * that a real user hitting "resend" a couple times works.
 *
 * Errors are deliberately vague on non-existent accounts: we don't leak
 * whether an email is registered. Supabase itself won't create a user
 * from `signInWithOtp` unless `shouldCreateUser` is true — which we leave
 * at the Supabase default (true).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    redirect_to?: string;
  };

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json(
      { errors: [{ code: "invalid_request", message: "Valid email required" }] },
      { status: 400 },
    );
  }

  // Two windows: 5/min per IP+email, 30/hour per IP (catches mass abuse).
  const emailBucket = rateLimitToken(request, email);
  const ipBucket = rateLimitToken(request);

  const [perEmail, perIp] = await Promise.all([
    rateLimitCheck({
      bucket: "magic_link_email",
      token: emailBucket,
      max: 5,
      windowSeconds: 60,
    }),
    rateLimitCheck({
      bucket: "magic_link_ip",
      token: ipBucket,
      max: 30,
      windowSeconds: 3600,
    }),
  ]);

  if (!perEmail.ok || !perIp.ok) {
    const retry = Math.max(perEmail.retryAfterSeconds, perIp.retryAfterSeconds);
    return NextResponse.json(
      {
        errors: [
          {
            code: "rate_limited",
            message: `Too many sign-in attempts. Try again in ${retry} seconds.`,
          },
        ],
      },
      {
        status: 429,
        headers: { "Retry-After": String(retry) },
      },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { errors: [{ code: "config_error", message: "Auth is not configured." }] },
      { status: 500 },
    );
  }

  // Use the anon client for signInWithOtp — Supabase needs the anon key path
  // because it doesn't expose this as an admin API. Still server-side.
  const client = createAdminClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
  const redirectTo = body.redirect_to ?? "/";
  const emailRedirectTo = `${origin}/auth/callback?redirect_to=${encodeURIComponent(redirectTo)}`;

  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });

  if (error) {
    // Don't surface Supabase's message unfiltered (can leak schema detail).
    return NextResponse.json(
      {
        errors: [
          {
            code: "send_failed",
            message: "Could not send sign-in link. Please try again.",
          },
        ],
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ data: { sent: true } });
}
