import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";

/**
 * POST /api/v1/health/error-log
 *
 * Diagnostic sink for runtime errors caught by error.tsx. Inserts a
 * row into _debug_error_log with the URL, digest, message, and a
 * truncated stack so we can read the actual error remotely. Auth-free
 * (under /api/v1/health/* which is allowlisted).
 *
 * REMOVE both this route and the table once we've identified the
 * navigation-stuck root cause.
 */
export const dynamic = "force-dynamic";

interface IncomingBody {
  url?: string;
  digest?: string | null;
  message?: string | null;
  stack?: string | null;
}

export async function POST(request: NextRequest) {
  let body: IncomingBody = {};
  try {
    body = (await request.json()) as IncomingBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, error: "no admin client" });
  }
  const admin = createAdminClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // eslint-disable-next-line
  const { error } = await admin
    .from("_debug_error_log" as never)
    .insert({
      url: body.url ?? null,
      digest: body.digest ?? null,
      message: body.message?.slice(0, 1000) ?? null,
      stack: body.stack?.slice(0, 4000) ?? null,
      user_agent: request.headers.get("user-agent"),
    } as never);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
