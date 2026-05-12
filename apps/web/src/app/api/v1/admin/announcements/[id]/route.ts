import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ id: string }>;
}

/**
 * PATCH  /api/v1/admin/announcements/:id
 * DELETE /api/v1/admin/announcements/:id
 */
async function handlePatch(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    body?: string;
    audience?: "all" | "admins" | "space";
    audience_space_id?: string | null;
    starts_at?: string;
    ends_at?: string | null;
    dismissible?: boolean;
  };

  const patch: Record<string, unknown> = {};
  if (typeof body.body === "string") patch.body = body.body.slice(0, 4000);
  if (body.audience) patch.audience = body.audience;
  if (body.audience_space_id !== undefined)
    patch.audience_space_id = body.audience_space_id;
  if (body.starts_at) patch.starts_at = body.starts_at;
  if (body.ends_at !== undefined) patch.ends_at = body.ends_at;
  if (typeof body.dismissible === "boolean")
    patch.dismissible = body.dismissible;
  if (Object.keys(patch).length === 0)
    return bad("nothing to update");
  patch.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("announcements")
    .update(patch as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.announcement.updated", {
    actor_id: actorId,
    entity_type: "announcement",
    entity_id: id,
    payload: { fields: Object.keys(patch) },
  });

  return NextResponse.json({ data });
}

async function handleDelete(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const { error } = await admin.from("announcements").delete().eq("id", id);
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.announcement.deleted", {
    actor_id: actorId,
    entity_type: "announcement",
    entity_id: id,
    payload: {},
  });

  return new NextResponse(null, { status: 204 });
}

function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}

export const PATCH = withObservability<Props>(
  handlePatch,
  "PATCH /api/v1/admin/announcements/:id",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/admin/announcements/:id",
);
