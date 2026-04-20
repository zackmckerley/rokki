/**
 * Thin wrapper around the `rate_limit_check` RPC. Always call from server
 * code (route handlers, server actions) — never the browser. Uses the
 * service-role client so it's not subject to RLS.
 */

import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

interface CheckOpts {
  bucket: string;
  token: string;
  max: number;
  windowSeconds: number;
}

/**
 * Returns `{ ok: true }` if the caller may proceed, `{ ok: false, retryAfterSeconds }`
 * if they're over the cap for this window. Failing open on DB errors is
 * intentional — a broken limiter should not brick the whole app.
 */
export async function rateLimitCheck(opts: CheckOpts): Promise<RateLimitResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Dev machine with no service key — let it through. Production must have it.
    return { ok: true, retryAfterSeconds: 0 };
  }

  const admin = createAdminClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The RPC isn't in the generated Database types. Cast the function
  // *name* (and params) instead of extracting `admin.rpc` into a local —
  // pulling it off the object breaks the `this` binding Supabase's
  // postgrest client needs at call time, producing a confusing
  // "Cannot read properties of undefined (reading 'rest')" runtime error.
  const { data, error } = await admin.rpc(
    "rate_limit_check" as never,
    {
      _bucket: opts.bucket,
      _token: opts.token,
      _max_hits: opts.max,
      _window_seconds: opts.windowSeconds,
    } as never,
  );

  if (error) {
    console.warn("rateLimitCheck failed; failing open", error.message);
    return { ok: true, retryAfterSeconds: 0 };
  }

  return data === true
    ? { ok: true, retryAfterSeconds: 0 }
    : { ok: false, retryAfterSeconds: opts.windowSeconds };
}

/**
 * Extract a best-effort token from the incoming request — user id if
 * authenticated, else IP. For anonymous endpoints (like sign-in) this
 * will usually be the IP.
 */
export function rateLimitToken(request: Request, extra?: string): string {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || "unknown";
  return extra ? `${ip}:${extra}` : ip;
}
