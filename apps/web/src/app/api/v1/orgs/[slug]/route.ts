import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * GET   /api/v1/orgs/:slug
 * PATCH /api/v1/orgs/:slug  { name?, slug? }
 *
 * Only space owners/admins (or platform admins) can edit. Slug renames are
 * allowed — existing URLs break, but that's the user's call. DELETE is not
 * exposed: spaces are not routinely deleted, and doing so through the UI
 * would require a destructive-confirm flow we haven't built yet.
 */
const SLUG = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

export async function GET(_req: NextRequest, { params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data } = await supabase
    .from("spaces")
    .select("id, slug, name, created_at")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();

  if (!data) return notFound();
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const space = await resolveSpace(supabase, slug);
  if (!space) return notFound();

  const allowed = await canManageSpace(supabase, space, user.id);
  if (!allowed) return forbidden("only space owners or admins can edit");

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    slug?: string;
  };

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (n.length < 1 || n.length > 120)
      return bad("name must be 1–120 characters");
    patch.name = n;
  }
  if (typeof body.slug === "string") {
    const s = body.slug.trim().toLowerCase();
    if (!SLUG.test(s))
      return bad(
        "slug must be lowercase letters, digits, or hyphens (3-40 chars, start with letter)",
      );
    patch.slug = s;
  }
  if (Object.keys(patch).length === 0) return bad("no patchable fields given");

  const { data, error } = await supabase
    .from("spaces")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .update(patch)
    .eq("id", space.id)
    .select("id, slug, name")
    .single();

  if (error || !data) {
    if (error?.code === "23505") return conflict("slug already taken");
    return internal(error?.message ?? "update failed");
  }

  void emitEvent("space.updated", {
    actor_id: user.id,
    space_id: space.id,
    entity_type: "space",
    entity_id: space.id,
    payload: { fields: Object.keys(patch) },
  });

  return NextResponse.json({ data });
}

async function resolveSpace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
) {
  const { data } = await supabase
    .from("spaces")
    .select("id, slug, name")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  return data as { id: string; slug: string; name: string } | null;
}

async function canManageSpace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  space: { id: string },
  userId: string,
) {
  const [{ data: sm }, { data: prof }] = await Promise.all([
    supabase
      .from("space_members")
      .select("role")
      .eq("space_id", space.id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const role = (sm as { role?: string } | null)?.role;
  if (role === "owner" || role === "admin") return true;
  if ((prof as { is_platform_admin?: boolean } | null)?.is_platform_admin)
    return true;
  return false;
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
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "Space not found" }] },
    { status: 404 },
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
