import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

/**
 * GET  /api/v1/user-views?scope=tasks&terminal=<uuid>
 *   Returns the caller's views plus any shared views in the terminal.
 *   Filters: scope (required), terminal (optional).
 *
 * POST /api/v1/user-views { scope, terminal_id?, name, filter, sort, columns, is_shared? }
 *   Creates a new view owned by the caller. RLS enforces terminal membership.
 *
 * See supabase/migrations/20260428020000_user_views.sql for the row shape.
 */

const ALLOWED_SCOPES = new Set(["tasks", "files", "activity", "audit"]);

interface UserViewRow {
  id: string;
  owner_id: string;
  scope: string;
  terminal_id: string | null;
  name: string;
  filter: Record<string, unknown>;
  sort: Record<string, unknown>;
  columns: unknown[];
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const terminal = url.searchParams.get("terminal");
  if (!scope || !ALLOWED_SCOPES.has(scope))
    return bad("scope must be one of tasks, files, activity, audit");

  let query = supabase
    .from("user_views")
    .select(
      "id, owner_id, scope, terminal_id, name, filter, sort, columns, is_shared, created_at, updated_at",
    )
    .eq("scope", scope);

  // RLS still applies — but narrowing here keeps payload size sane when a
  // user has hundreds of views across many terminals.
  if (terminal) {
    // Either own (any terminal) OR shared in *this* terminal. We can't
    // express that cleanly with a single PostgREST filter chain, so we
    // make two queries and merge. Avoids round-tripping the entire view
    // catalogue.
    const [ownRes, sharedRes] = await Promise.all([
      query.eq("owner_id", user.id),
      supabase
        .from("user_views")
        .select(
          "id, owner_id, scope, terminal_id, name, filter, sort, columns, is_shared, created_at, updated_at",
        )
        .eq("scope", scope)
        .eq("is_shared", true)
        .eq("terminal_id", terminal)
        .neq("owner_id", user.id),
    ]);
    if (ownRes.error) return internal(ownRes.error.message);
    if (sharedRes.error) return internal(sharedRes.error.message);

    // Filter own to either matching terminal OR scope-wide (terminal_id IS NULL).
    const own = (ownRes.data as UserViewRow[]).filter(
      (r) => r.terminal_id === null || r.terminal_id === terminal,
    );
    const merged = dedupeById([...own, ...(sharedRes.data as UserViewRow[])]);
    merged.sort(byNameAsc);
    return NextResponse.json({ data: merged });
  }

  // No terminal filter: return everything the caller can see at this scope.
  const { data, error } = await query.order("name", { ascending: true });
  if (error) return internal(error.message);
  return NextResponse.json({ data: (data ?? []) as UserViewRow[] });
}

async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    scope?: string;
    terminal_id?: string | null;
    name?: string;
    filter?: Record<string, unknown>;
    sort?: Record<string, unknown>;
    columns?: unknown[];
    is_shared?: boolean;
  };

  if (!body.scope || !ALLOWED_SCOPES.has(body.scope))
    return bad("scope must be one of tasks, files, activity, audit");
  const name = body.name?.trim();
  if (!name) return bad("name is required");
  if (name.length > 80) return bad("name must be ≤ 80 characters");

  const insertRow = {
    owner_id: user.id,
    scope: body.scope,
    terminal_id: body.terminal_id ?? null,
    name,
    filter: body.filter ?? {},
    sort: body.sort ?? {},
    columns: body.columns ?? [],
    is_shared: Boolean(body.is_shared),
  };

  const { data, error } = await supabase
    .from("user_views")
    // @ts-expect-error generic insert collapses to never
    .insert(insertRow)
    .select(
      "id, owner_id, scope, terminal_id, name, filter, sort, columns, is_shared, created_at, updated_at",
    )
    .single();
  if (error) return internal(error.message);
  return NextResponse.json({ data: data as UserViewRow }, { status: 201 });
}

function dedupeById(rows: UserViewRow[]): UserViewRow[] {
  const seen = new Set<string>();
  const out: UserViewRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function byNameAsc(a: UserViewRow, b: UserViewRow): number {
  return a.name.localeCompare(b.name);
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const GET = withObservability(handleGet, "GET /api/v1/user-views");
export const POST = withObservability(handlePost, "POST /api/v1/user-views");
