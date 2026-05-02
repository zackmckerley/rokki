import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * One-off diagnostic endpoint for the /settings/calendars 500 error.
 *
 * Probes:
 *   1. Does `calendar_connections` table exist?
 *   2. Does the exact SELECT the page makes succeed under service role?
 *   3. Echo the env-var presence (no values).
 *
 * Protected by a shared secret header so it isn't open to the world.
 * REMOVE THIS ROUTE once we've diagnosed the issue.
 */

export const dynamic = "force-dynamic";

const PROBE_SECRET = "rokki-debug-probe-7fK2pX9mVnQz";

export async function GET(req: Request) {
  if (req.headers.get("x-debug-secret") !== PROBE_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!serviceKey,
    NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_URL_value: process.env.NEXT_PUBLIC_APP_URL,
    MICROSOFT_OAUTH_CLIENT_ID: !!process.env.MICROSOFT_OAUTH_CLIENT_ID,
    MICROSOFT_OAUTH_CLIENT_SECRET: !!process.env.MICROSOFT_OAUTH_CLIENT_SECRET,
    MICROSOFT_OAUTH_TENANT: !!process.env.MICROSOFT_OAUTH_TENANT,
    TOKEN_ENCRYPTION_KEY: !!process.env.TOKEN_ENCRYPTION_KEY,
  };

  if (!url || !serviceKey) {
    return NextResponse.json({ env, error: "missing supabase config" });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Probe 1: information_schema.tables for calendar_connections + calendar_events.
  const tablesResult: { table_name: string; column_count?: number }[] = [];
  try {
    const { data, error } = await admin
      .from("information_schema.tables" as never)
      .select("table_schema, table_name")
      .eq("table_schema", "public")
      .in("table_name", [
        "calendar_connections",
        "calendar_events",
        "calendar_event_writes",
        "spaces",
        "terminals",
        "tasks",
      ]);
    if (error) {
      tablesResult.push({ table_name: `query_error: ${error.message}` });
    } else if (data) {
      for (const r of data as { table_name: string }[]) {
        tablesResult.push({ table_name: r.table_name });
      }
    }
  } catch (e) {
    tablesResult.push({
      table_name: `exception: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  // Probe 2: run the exact SELECT the calendars page makes.
  let pageQueryResult: unknown;
  try {
    const { data, error } = await admin
      .from("calendar_connections")
      .select(
        "id, provider, account_email, last_sync_at, last_sync_error, revoked_at, created_at",
      )
      .limit(1);
    pageQueryResult = error
      ? { ok: false, error: error.message, code: error.code, hint: error.hint, details: error.details }
      : { ok: true, rows: (data ?? []).length };
  } catch (e) {
    pageQueryResult = {
      ok: false,
      thrown: e instanceof Error ? e.message : String(e),
    };
  }

  // Probe 3: list all migrations applied (supabase tracks them in supabase_migrations.schema_migrations).
  let migrations: unknown;
  try {
    const { data, error } = await admin
      .schema("supabase_migrations" as never)
      .from("schema_migrations" as never)
      .select("version, name")
      .order("version", { ascending: false })
      .limit(15);
    migrations = error ? { error: error.message } : data;
  } catch (e) {
    migrations = { thrown: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({
    env,
    tablesFound: tablesResult,
    pageQueryResult,
    recentMigrations: migrations,
  });
}
