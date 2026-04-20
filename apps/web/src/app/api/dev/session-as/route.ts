import { NextResponse, type NextRequest } from "next/server";
import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * DEV-ONLY. Mint a session for a given email without going through the magic-link flow.
 * Used for E2E testing inside sandboxed preview browsers that can't follow
 * cross-origin redirects to the Supabase verify endpoint.
 *
 * Returns 404 in production. Refuses any email not on @test.rokki.ai.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ errors: [{ code: "not_found" }] }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.toLowerCase().trim();
  if (!email || !email.endsWith("@test.rokki.ai")) {
    return NextResponse.json(
      { errors: [{ code: "invalid_request", message: "email must be @test.rokki.ai" }] },
      { status: 400 },
    );
  }

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Ensure user exists + is confirmed. createUser is idempotent on email conflict.
  await admin.auth.admin.createUser({ email, email_confirm: true });

  // Use signInWithPassword via generateLink to get a token we can exchange.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData) {
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: linkErr?.message ?? "generateLink failed" }] },
      { status: 500 },
    );
  }

  const hashed = linkData.properties?.hashed_token;
  if (!hashed) {
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: "no hashed_token" }] },
      { status: 500 },
    );
  }

  // Bind cookies to the outgoing response.
  const response = NextResponse.json({ data: { email } });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashed,
  });
  if (otpErr) {
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: otpErr.message }] },
      { status: 500 },
    );
  }

  return response;
}
