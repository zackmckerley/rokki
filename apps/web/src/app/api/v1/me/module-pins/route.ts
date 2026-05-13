import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

/**
 * Per-user module pin endpoints — drive the pane-strip ordering +
 * F-key bindings for the calling user only. RLS on
 * `user_module_pins` enforces "own rows only" so the handlers don't
 * need extra authz checks.
 *
 * GET  /api/v1/me/module-pins?scope=<kind>&scope_id=<uuid>
 *   List the caller's pins for a given scope. `scope` is one of
 *   "user", "space", "terminal". `scope_id` is required for space and
 *   terminal scopes, omitted for user.
 *
 * PUT  /api/v1/me/module-pins
 *   Replace the caller's pins for a single (scope_kind, scope_id)
 *   bucket. Body: { scope_kind, scope_id?, pins: [{ slug, display_order, fn_key? }] }.
 *   Upsert + delete-missing semantics: anything missing from the new
 *   pins list is removed from the bucket. This makes drag-reorder
 *   trivial — send the whole list every drop.
 *
 * PATCH /api/v1/me/module-pins
 *   Tweak a single pin's `fn_key`. Body:
 *   { scope_kind, scope_id?, slug, fn_key | null }
 *   Convenience endpoint for the F-key picker; equivalent to PUT
 *   with one row mutated.
 */

async function handleGet(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const url = new URL(req.url);
  const scopeKind = url.searchParams.get("scope") ?? "user";
  const scopeId = url.searchParams.get("scope_id");
  if (!["user", "space", "terminal"].includes(scopeKind))
    return badRequest("scope must be user, space, or terminal");
  if (scopeKind !== "user" && !scopeId)
    return badRequest("scope_id is required for space and terminal scopes");

  let query = supabase
    .from("user_module_pins")
    .select("slug, display_order, fn_key")
    .eq("user_id", user.id)
    .eq("scope_kind", scopeKind);
  if (scopeKind === "user") {
    query = query.is("scope_id", null);
  } else {
    query = query.eq("scope_id", scopeId!);
  }
  const { data } = await query.order("display_order", { ascending: true });
  return NextResponse.json({ data: data ?? [] });
}

interface PinInput {
  slug: string;
  display_order: number;
  fn_key?: number | null;
}

async function handlePut(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  let body: {
    scope_kind?: string;
    scope_id?: string | null;
    pins?: PinInput[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const scopeKind = body.scope_kind ?? "";
  if (!["user", "space", "terminal"].includes(scopeKind))
    return badRequest("scope_kind must be user, space, or terminal");
  const scopeId = scopeKind === "user" ? null : body.scope_id ?? null;
  if (scopeKind !== "user" && !scopeId)
    return badRequest("scope_id is required for space and terminal scopes");
  const pins = body.pins;
  if (!Array.isArray(pins))
    return badRequest("pins must be an array");

  // Validate each pin row.
  for (const p of pins) {
    if (typeof p.slug !== "string" || p.slug.trim() === "")
      return badRequest("each pin needs a non-empty slug");
    if (typeof p.display_order !== "number")
      return badRequest("each pin needs a numeric display_order");
    if (
      p.fn_key != null &&
      (typeof p.fn_key !== "number" || p.fn_key < 5 || p.fn_key > 10)
    )
      return badRequest("fn_key must be between 5 and 10 (or null)");
  }

  // Delete-and-replace for the bucket. Cheaper than computing a diff
  // for small N; users have at most ~20 pins per scope.
  let del = supabase
    .from("user_module_pins")
    .delete()
    .eq("user_id", user.id)
    .eq("scope_kind", scopeKind);
  if (scopeId === null) {
    del = del.is("scope_id", null);
  } else {
    del = del.eq("scope_id", scopeId);
  }
  const { error: delErr } = await del;
  if (delErr)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: delErr.message }] },
      { status: 500 },
    );

  if (pins.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const payload = pins.map((p) => ({
    user_id: user.id,
    scope_kind: scopeKind,
    scope_id: scopeId,
    slug: p.slug,
    display_order: p.display_order,
    fn_key: p.fn_key ?? null,
  }));
  const { data, error } = await supabase
    .from("user_module_pins")
    .insert(payload as never)
    .select("slug, display_order, fn_key");
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );
  return NextResponse.json({ data: data ?? [] });
}

async function handlePatch(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  let body: {
    scope_kind?: string;
    scope_id?: string | null;
    slug?: string;
    fn_key?: number | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid JSON body");
  }
  const scopeKind = body.scope_kind ?? "";
  if (!["user", "space", "terminal"].includes(scopeKind))
    return badRequest("scope_kind must be user, space, or terminal");
  const scopeId = scopeKind === "user" ? null : body.scope_id ?? null;
  const slug = body.slug?.trim() ?? "";
  if (!slug) return badRequest("slug is required");
  const fnKey = body.fn_key;
  if (
    fnKey != null &&
    (typeof fnKey !== "number" || fnKey < 5 || fnKey > 10)
  )
    return badRequest("fn_key must be 5-10 or null");

  // Clear any pin row that already claims this fn_key in the bucket
  // so two slugs never share an F-key. Only meaningful when fnKey is
  // a number; null means "unbind".
  if (typeof fnKey === "number") {
    let clear = supabase
      .from("user_module_pins")
      .update({ fn_key: null } as never)
      .eq("user_id", user.id)
      .eq("scope_kind", scopeKind)
      .eq("fn_key", fnKey)
      .neq("slug", slug);
    if (scopeId === null) {
      clear = clear.is("scope_id", null);
    } else {
      clear = clear.eq("scope_id", scopeId);
    }
    const { error } = await clear;
    if (error)
      return NextResponse.json(
        { errors: [{ code: "internal_error", message: error.message }] },
        { status: 500 },
      );
  }

  let update = supabase
    .from("user_module_pins")
    .update({ fn_key: fnKey ?? null } as never)
    .eq("user_id", user.id)
    .eq("scope_kind", scopeKind)
    .eq("slug", slug);
  if (scopeId === null) {
    update = update.is("scope_id", null);
  } else {
    update = update.eq("scope_id", scopeId);
  }
  const { data, error } = await update
    .select("slug, display_order, fn_key")
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );
  if (!data)
    return NextResponse.json(
      {
        errors: [
          {
            code: "not_found",
            message:
              "No pin exists for that slug yet — create it via PUT first.",
          },
        ],
      },
      { status: 404 },
    );
  return NextResponse.json({ data });
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}

function badRequest(message: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message }] },
    { status: 400 },
  );
}

export const GET = withObservability(handleGet, "GET /api/v1/me/module-pins");
export const PUT = withObservability(handlePut, "PUT /api/v1/me/module-pins");
export const PATCH = withObservability(
  handlePatch,
  "PATCH /api/v1/me/module-pins",
);
