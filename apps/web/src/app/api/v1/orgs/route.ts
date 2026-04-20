import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET  /api/v1/orgs           — list my orgs
 * POST /api/v1/orgs           — create a new org (caller becomes owner via trigger)
 *
 * See docs/02_API.md §2.5.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data, error } = await supabase
    .from("space_members")
    .select("role, spaces(id, slug, name, created_at)")
    .eq("user_id", user.id);

  if (error) return internal(error.message);
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  // Only platform admins may create spaces. We surface a clear 403 here so
  // callers don't get a confusing RLS rejection later.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!(profile as { is_platform_admin?: boolean } | null)?.is_platform_admin) {
    return forbidden(
      "Only platform administrators can create spaces. Ask an admin to invite you.",
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    slug?: string;
    name?: string;
  };

  if (!body.slug || !body.name) return bad("slug and name are required");

  const SLUG = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;
  if (!SLUG.test(body.slug))
    return bad(
      "slug must be lowercase letters, digits, or hyphens (3-40 chars, starts with letter)",
    );

  if (body.name.length < 1 || body.name.length > 120)
    return bad("name must be 1–120 characters");

  const result = await supabase
    .from("spaces")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({ slug: body.slug, name: body.name, created_by: user.id })
    .select("id, slug, name, created_at")
    .single();

  const data = result.data as
    | { id: string; slug: string; name: string; created_at: string }
    | null;
  const error = result.error;

  if (error || !data) {
    if (error?.code === "23505") return conflict("slug already taken");
    return internal(error?.message ?? "insert failed");
  }

  return NextResponse.json({ data }, { status: 201 });
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
function forbidden(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "forbidden", message: msg }] },
    { status: 403 },
  );
}
function conflict(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "conflict", message: msg }] },
    { status: 409 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}
