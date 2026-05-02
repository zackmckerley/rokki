import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * One-off diagnostic endpoint for the /settings/calendars 500 error.
 *
 * v2: also tries to dynamically import the page module and invoke it,
 * capturing any thrown error with stack.
 *
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

  if (!url || !serviceKey) {
    return NextResponse.json({ error: "missing supabase config" });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Probe 1: list all calendar_connections rows (svc role bypasses RLS).
  let allConnections: unknown;
  try {
    const { data, error } = await admin
      .from("calendar_connections")
      .select(
        "id, user_id, provider, account_email, last_sync_at, last_sync_error, revoked_at, created_at, scopes",
      )
      .order("created_at", { ascending: false })
      .limit(20);
    allConnections = error
      ? { error: error.message, code: error.code, hint: error.hint, details: error.details }
      : data;
  } catch (e) {
    allConnections = { thrown: e instanceof Error ? e.message : String(e) };
  }

  // Probe 2: schema introspection via RPC. Most projects have an
  // anonymous-but-restricted view of public-schema columns; if not, this
  // surfaces the error so we know.
  let columns: unknown;
  try {
    const { data, error } = await admin.rpc(
      "rokki_debug_columns" as never,
      { table_name: "calendar_connections" } as never,
    );
    columns = error
      ? { rpcError: error.message }
      : data;
  } catch (e) {
    columns = { thrown: e instanceof Error ? e.message : String(e) };
  }

  // Probe 3: try to dynamically import the calendars page module. If it
  // throws at import-time (e.g. failing module side-effect), we capture
  // the error here. Note: actually rendering the JSX requires React + a
  // RSC context that we can't easily simulate, but import errors alone
  // catch most "page won't load" cases.
  let pageImport: unknown;
  try {
    const mod = (await import("@/app/settings/calendars/page")) as Record<
      string,
      unknown
    >;
    pageImport = {
      ok: true,
      hasDefault: typeof mod.default === "function",
      keys: Object.keys(mod),
    };
  } catch (e) {
    pageImport = {
      ok: false,
      thrown: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.split("\n").slice(0, 8).join("\n") : null,
    };
  }

  // Probe 4: try to actually invoke the page's default export with empty
  // searchParams. The redirect("/login") path will throw a NEXT_REDIRECT
  // signal — that's fine, we just want to confirm we can get past imports
  // and into the function body.
  let pageInvoke: unknown;
  try {
    const mod = (await import("@/app/settings/calendars/page")) as {
      default: (props: { searchParams: Promise<Record<string, string>> }) => Promise<unknown>;
    };
    const fakeParams = Promise.resolve({});
    await mod.default({ searchParams: fakeParams });
    pageInvoke = { ok: true, note: "no throw — unexpected" };
  } catch (e) {
    const isRedirect =
      typeof e === "object" &&
      e !== null &&
      "digest" in e &&
      typeof (e as { digest?: string }).digest === "string" &&
      ((e as { digest: string }).digest.includes("NEXT_REDIRECT") ||
        (e as { digest: string }).digest.includes("NEXT_NOT_FOUND"));
    pageInvoke = {
      ok: false,
      thrown: e instanceof Error ? e.message : String(e),
      digest: (e as { digest?: string })?.digest ?? null,
      isExpectedNextSignal: isRedirect,
      stack: e instanceof Error ? e.stack?.split("\n").slice(0, 12).join("\n") : null,
    };
  }

  // Probe 5: import providerConfig and call it for both providers.
  let providerConfigCheck: unknown;
  try {
    const { providerConfig } = (await import(
      "@/lib/calendar-oauth"
    )) as typeof import("@/lib/calendar-oauth");
    providerConfigCheck = {
      google: providerConfig("google") !== null,
      microsoft: providerConfig("microsoft") !== null,
      microsoftDetails: (() => {
        const c = providerConfig("microsoft");
        if (!c) return null;
        return {
          authorizeUrl: c.authorizeUrl,
          redirectUri: c.redirectUri,
          scopes: c.scopes,
        };
      })(),
    };
  } catch (e) {
    providerConfigCheck = {
      thrown: e instanceof Error ? e.message : String(e),
    };
  }

  return NextResponse.json({
    allConnections,
    columns,
    pageImport,
    pageInvoke,
    providerConfigCheck,
  });
}
