import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
/**
 * GET  /api/v1/admin/spaces
 *   ?q=         search by name or slug
 *   ?filter=    "active" (default) | "archived" | "all"
 *   ?limit=     default 50
 *
 * POST /api/v1/admin/spaces
 *   { name, slug, description?, initial_owner_user_id }
 */

const SLUG_RE = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

async function handleGet(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const filter = url.searchParams.get("filter") ?? "active";
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    200,
  );

  let query = admin
    .from("spaces")
    .select("id, slug, name, description, archived_at, created_at, created_by")
    .order("name", { ascending: true })
    .limit(limit);
  if (filter === "active") query = query.is("archived_at", null);
  else if (filter === "archived") query = query.not("archived_at", "is", null);
  if (q) {
    // simple OR via ilike on two columns
    query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return internal(error.message);

  // Reshape so SpacePicker can consume directly.
  const rows = (data ?? []).map((s) => ({
    space_id: (s as { id: string }).id,
    slug: (s as { slug: string }).slug,
    name: (s as { name: string }).name,
    description: (s as { description: string | null }).description,
    archived_at: (s as { archived_at: string | null }).archived_at,
    created_at: (s as { created_at: string }).created_at,
  }));

  return NextResponse.json({ data: rows });
}

async function handlePost(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    slug?: string;
    description?: string;
    initial_owner_user_id?: string;
  };

  const name = body.name?.trim() ?? "";
  const slug = body.slug?.trim().toLowerCase() ?? "";
  if (!name || name.length > 120) return bad("name must be 1–120 chars");
  if (!SLUG_RE.test(slug))
    return bad("slug must be 3–40 lowercase letters/digits/hyphens");
  const ownerId = body.initial_owner_user_id?.trim();
  if (!ownerId) return bad("initial_owner_user_id required");

  // Sanity check that the owner exists.
  const { data: owner } = await admin.auth.admin.getUserById(ownerId);
  if (!owner?.user) return bad("initial owner not found");

  const result = await admin
    .from("spaces")
    .insert({
      slug,
      name,
      description: body.description?.slice(0, 1000) ?? null,
      created_by: ownerId,
    } as never)
    .select("id, slug, name")
    .single();
  if (result.error) {
    if (result.error.code === "23505") return conflict("slug already taken");
    return internal(result.error.message);
  }
  const space = result.data as { id: string; slug: string; name: string };

  // Add the owner as a space owner. The trigger that runs on space insert
  // typically does this for the creator, but we set it explicitly because
  // `created_by` may not equal the actor.
  await admin
    .from("space_members")
    .upsert(
      { space_id: space.id, user_id: ownerId, role: "owner" } as never,
      { onConflict: "space_id,user_id" },
    );

  void emitEvent("admin.space.created", {
    actor_id: actorId,
    space_id: space.id,
    entity_type: "space",
    entity_id: space.id,
    payload: { slug, name, owner_id: ownerId },
  });

  return NextResponse.json({ data: space }, { status: 201 });
}

function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
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

export const GET = withObservability(
  handleGet,
  "GET /api/v1/admin/spaces",
);
export const POST = withObservability(
  handlePost,
  "POST /api/v1/admin/spaces",
);
