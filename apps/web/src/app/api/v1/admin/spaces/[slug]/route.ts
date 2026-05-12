import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ slug: string }>;
}

const SLUG_RE = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;

/**
 * GET    /api/v1/admin/spaces/:slug      → full detail (members, terminal counts, usage)
 * PATCH  /api/v1/admin/spaces/:slug      { name?, slug?, description? }
 * DELETE /api/v1/admin/spaces/:slug      → archive (soft, sets archived_at)
 */
async function handleGet(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const { data: space } = await admin
    .from("spaces")
    .select(
      "id, slug, name, description, archived_at, created_at, created_by",
    )
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!space) return notFound();
  const s = space as {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    archived_at: string | null;
    created_at: string;
    created_by: string;
  };

  const [{ data: members }, { data: terminals }, { count: fileCount }, { count: taskCount }] =
    await Promise.all([
      admin
        .from("space_members")
        .select("user_id, role, joined_at")
        .eq("space_id", s.id)
        .order("joined_at", { ascending: true }),
      admin
        .from("terminals")
        .select("id, ticker, name, status, archived_at, created_at")
        .eq("space_id", s.id)
        .order("created_at", { ascending: false }),
      admin
        .from("files")
        .select("id, terminals!inner(space_id)", { count: "exact", head: true })
        .eq("terminals.space_id", s.id)
        .is("deleted_at", null),
      admin
        .from("tasks")
        .select("id, terminals!inner(space_id)", { count: "exact", head: true })
        .eq("terminals.space_id", s.id)
        .is("deleted_at", null),
    ]);

  // Hydrate member emails/names
  const memberRows = (members ?? []) as {
    user_id: string;
    role: string;
    joined_at: string;
  }[];
  const userIds = memberRows.map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await admin
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds)
    : { data: [] };
  const profMap = new Map(
    ((profiles ?? []) as { user_id: string; full_name: string | null }[]).map(
      (p) => [p.user_id, p.full_name],
    ),
  );
  const { data: authUsers } = await admin.auth.admin.listUsers({
    perPage: 200,
    page: 1,
  });
  const emailMap = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  return NextResponse.json({
    data: {
      space: s,
      members: memberRows.map((m) => ({
        ...m,
        full_name: profMap.get(m.user_id) ?? null,
        email: emailMap.get(m.user_id) ?? "",
      })),
      terminals: terminals ?? [],
      usage: {
        terminal_count: (terminals ?? []).length,
        member_count: memberRows.length,
        file_count: fileCount ?? 0,
        task_count: taskCount ?? 0,
      },
    },
  });
}

async function handlePatch(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    slug?: string;
    description?: string | null;
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
    if (!SLUG_RE.test(s))
      return bad("slug must be lowercase letters/digits/hyphens (3–40)");
    patch.slug = s;
  }
  if (body.description === null || typeof body.description === "string") {
    patch.description = body.description ? body.description.slice(0, 1000) : null;
  }
  if (Object.keys(patch).length === 0) return bad("no patchable fields");

  const { data: space } = await admin
    .from("spaces")
    .select("id")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!space) return notFound();
  const id = (space as { id: string }).id;

  const { data, error } = await admin
    .from("spaces")
    .update(patch as never)
    .eq("id", id)
    .select("id, slug, name")
    .single();
  if (error) {
    if (error.code === "23505") return conflict("slug already taken");
    return internal(error.message);
  }

  void emitEvent("admin.space.updated", {
    actor_id: actorId,
    space_id: id,
    entity_type: "space",
    entity_id: id,
    payload: { fields: Object.keys(patch) },
  });

  return NextResponse.json({ data });
}

async function handleDelete(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const { data: space } = await admin
    .from("spaces")
    .select("id, name")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!space) return notFound();
  const s = space as { id: string; name: string };

  // We don't have an `archived_at` column on spaces today; use a soft
  // marker via the description suffix is wrong. Add a column on the fly.
  // Actually: spaces table doesn't have archived_at. We'll add it via
  // the W1 migration. For now, also set archived_at via a check.
  const { error } = await admin
    .from("spaces")
    .update({ archived_at: new Date().toISOString() } as never)
    .eq("id", s.id);
  if (error) return internal(error.message);

  void emitEvent("admin.space.archived", {
    actor_id: actorId,
    space_id: s.id,
    entity_type: "space",
    entity_id: s.id,
    payload: { name: s.name },
  });

  return NextResponse.json({ data: { archived: true } });
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
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "Space not found" }] },
    { status: 404 },
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
  "GET /api/v1/admin/spaces/:slug",
);
export const PATCH = withObservability<Props>(
  handlePatch,
  "PATCH /api/v1/admin/spaces/:slug",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/admin/spaces/:slug",
);
