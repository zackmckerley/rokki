import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events";
import { withObservability } from "@/lib/observability";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * GET    /api/v1/orgs/:slug
 * PATCH  /api/v1/orgs/:slug  { name?, slug? }
 * DELETE /api/v1/orgs/:slug
 *
 * Only space owners/admins (or platform admins) can edit. Slug renames
 * are allowed — existing URLs break, but that's the user's call.
 *
 * DELETE is owner-only (stricter than the PATCH gate, which allows
 * admins). It's a SOFT delete via `archived_at` — the
 * `cascade_space_archive` trigger fans the archive down to every
 * terminal / task / file in the space, and `purge_expired_trash()`
 * hard-deletes them after the TTL. Restorable via the admin console
 * within the retention window.
 *
 * Two-step confirmation lives on the client (settings page) — the
 * server trusts the request once auth + role pass.
 */
const SLUG = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

async function handleGet(_req: NextRequest, { params }: Props) {
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

async function handlePatch(request: NextRequest, { params }: Props) {
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

async function handleDelete(_req: NextRequest, { params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const space = await resolveSpace(supabase, slug);
  if (!space) return notFound();

  // Owners-only — admins can rename/manage members but archiving a
  // whole space (with cascade-archive on every terminal/task/file
  // inside) is irreversible from the owner's seat once the TTL
  // expires. Platform admins still have a separate path in
  // /api/v1/admin/spaces/:slug for cross-space ops.
  const { data: membership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", space.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  if (role !== "owner") {
    return forbidden("only the space owner can delete this space");
  }

  // Idempotent: if already archived, no-op + return success so a
  // refresh-after-network-blip doesn't error out.
  const { data: current } = await supabase
    .from("spaces")
    .select("archived_at")
    .eq("id", space.id)
    .maybeSingle();
  const already = (current as { archived_at: string | null } | null)
    ?.archived_at;
  if (already) {
    return NextResponse.json({ data: { archived: true, archived_at: already } });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("spaces")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .update({ archived_at: now })
    .eq("id", space.id);
  // The `cascade_space_archive` AFTER UPDATE trigger fans this out
  // to terminals/tasks/files — no manual cleanup needed here.
  if (error) return internal(error.message);

  void emitEvent("space.archived", {
    actor_id: user.id,
    space_id: space.id,
    entity_type: "space",
    entity_id: space.id,
    payload: { slug: space.slug, name: space.name },
  });

  return NextResponse.json({ data: { archived: true, archived_at: now } });
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

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/orgs/:slug",
);
export const PATCH = withObservability<Props>(
  handlePatch,
  "PATCH /api/v1/orgs/:slug",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/orgs/:slug",
);
