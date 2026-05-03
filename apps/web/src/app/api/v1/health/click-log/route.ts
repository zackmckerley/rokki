import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";

/**
 * POST /api/v1/health/click-log
 *
 * Diagnostic sink for the ClickProbe. Inserts a single click event
 * into _debug_click_log. Auth-free (under the /api/v1/health/* path
 * that bypasses the supabase middleware) so the probe can fire even
 * when sessions are odd. Body shape:
 *   { url: string, payload: object }
 *
 * REMOVE both this route and the table once the navigation bug is
 * resolved. The table is namespaced with a leading underscore so
 * "everything in public starts with underscore is debug" is the
 * convention if more diagnostic tables get added.
 */
export const dynamic = "force-dynamic";

interface IncomingBody {
  url?: string;
  payload?: Record<string, unknown>;
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
    .from("_debug_click_log" as never)
    .insert({
      url: body.url ?? null,
      user_agent: request.headers.get("user-agent"),
      payload: body.payload ?? null,
    } as never);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
