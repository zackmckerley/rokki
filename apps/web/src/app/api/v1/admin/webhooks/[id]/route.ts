import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ id: string }>;
}

/**
 * PATCH  /api/v1/admin/webhooks/:id  { active?, events?, url?, description? }
 * DELETE /api/v1/admin/webhooks/:id
 */
async function handlePatch(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;
  const body = (await request.json().catch(() => ({}))) as {
    active?: boolean;
    events?: string[];
    url?: string;
    description?: string;
  };
  const patch: Record<string, unknown> = {};
  if (typeof body.active === "boolean") patch.active = body.active;
  if (Array.isArray(body.events)) patch.events = body.events;
  if (typeof body.url === "string") {
    if (!/^https?:\/\//.test(body.url)) return bad("invalid url");
    patch.url = body.url;
  }
  if (typeof body.description === "string")
    patch.description = body.description.slice(0, 500);
  if (Object.keys(patch).length === 0) return bad("no fields to update");
  patch.updated_at = new Date().toISOString();

  const { error } = await admin
    .from("webhook_destinations")
    .update(patch as never)
    .eq("id", id);
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.webhook.updated", {
    actor_id: actorId,
    entity_type: "webhook",
    entity_id: id,
    payload: { fields: Object.keys(patch) },
  });

  return NextResponse.json({ data: { id, ...patch } });
}

async function handleDelete(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const { error } = await admin
    .from("webhook_destinations")
    .delete()
    .eq("id", id);
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.webhook.deleted", {
    actor_id: actorId,
    entity_type: "webhook",
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
  "PATCH /api/v1/admin/webhooks/:id",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/admin/webhooks/:id",
);
