import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * PATCH  /api/v1/user-views/:id { name?, filter?, sort?, columns?, is_shared?, terminal_id? }
 * DELETE /api/v1/user-views/:id
 *
 * Owner-only. RLS enforces this; we additionally short-circuit
 * with a friendly 404 if the row isn't visible.
 */

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

async function handlePatch(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    filter?: Record<string, unknown>;
    sort?: Record<string, unknown>;
    columns?: unknown[];
    is_shared?: boolean;
    terminal_id?: string | null;
  };

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return bad("name cannot be empty");
    if (name.length > 80) return bad("name must be ≤ 80 characters");
    patch.name = name;
  }
  if (body.filter !== undefined) patch.filter = body.filter;
  if (body.sort !== undefined) patch.sort = body.sort;
  if (body.columns !== undefined) patch.columns = body.columns;
  if (body.is_shared !== undefined) patch.is_shared = Boolean(body.is_shared);
  if (body.terminal_id !== undefined) patch.terminal_id = body.terminal_id;

  if (Object.keys(patch).length === 0) return bad("nothing to update");

  const { data, error } = await supabase
    .from("user_views")
    // @ts-expect-error generic update collapses to never
    .update(patch)
    .eq("id", id)
    .select(
      "id, owner_id, scope, terminal_id, name, filter, sort, columns, is_shared, created_at, updated_at",
    )
    .maybeSingle();
  if (error) return internal(error.message);
  if (!data) return notFound();
  return NextResponse.json({ data: data as UserViewRow });
}

async function handleDelete(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { error } = await supabase.from("user_views").delete().eq("id", id);
  if (error) return internal(error.message);
  return new NextResponse(null, { status: 204 });
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
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "View not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const PATCH = withObservability<Props>(
  handlePatch,
  "PATCH /api/v1/user-views/:id",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/user-views/:id",
);
