import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ kind: string; id: string }>;
}

/**
 * POST   /api/v1/admin/trash/:kind/:id   → restore (clears deleted_at /
 *                                          archived_at on the row)
 * DELETE /api/v1/admin/trash/:kind/:id   → hard delete (after confirm)
 *
 * `kind` is one of: tasks, terminals, spaces, files, comments.
 *
 * Restore is best-effort cascade-aware: restoring a terminal does not
 * automatically un-trash its tasks/files because those may have been
 * trashed *before* the terminal archive (we can't tell from a single
 * timestamp). Operators restore parents first, then explicitly restore
 * any children they want back.
 */

const KIND_TO_TIMESTAMP: Record<string, string> = {
  tasks: "deleted_at",
  files: "deleted_at",
  comments: "deleted_at",
  terminals: "archived_at",
  spaces: "archived_at",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handlePost(request: NextRequest, { params }: Props) {
  const { kind, id } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const ts = KIND_TO_TIMESTAMP[kind];
  if (!ts) return bad(`unknown kind: ${kind}`);
  if (!UUID_RE.test(id)) return bad("id must be a uuid");

  const patch: Record<string, unknown> = { [ts]: null };
  // For terminals, also flip status back from "archived" so list views
  // pick it up again. We don't try to remember the prior status.
  if (kind === "terminals") {
    patch.status = "active";
  }

  const { error } = await admin.from(kind as "tasks").update(patch as never).eq("id", id);
  if (error) return internal(error.message);

  void emitEvent(`admin.trash.restored`, {
    actor_id: actorId,
    entity_type: kind.replace(/s$/, ""),
    entity_id: id,
    payload: { kind },
  });

  return NextResponse.json({ data: { restored: true, kind, id } });
}

async function handleDelete(request: NextRequest, { params }: Props) {
  const { kind, id } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const ts = KIND_TO_TIMESTAMP[kind];
  if (!ts) return bad(`unknown kind: ${kind}`);
  if (!UUID_RE.test(id)) return bad("id must be a uuid");

  // Hard-delete only allowed for already-soft-deleted rows. Belt + suspenders
  // so a misrouted call doesn't permanent-delete a live row. The dynamic
  // column name forces an `unknown` cast — supabase-js can't infer
  // `select(`id, ${ts}`)` against the generated Database type.
  const { data: row } = (await admin
    .from(kind as "tasks")
    .select(`id, ${ts}`)
    .eq("id", id)
    .maybeSingle()) as unknown as {
      data: Record<string, unknown> | null;
    };
  if (!row) return notFound();
  if (row[ts] == null)
    return bad(
      "row is not soft-deleted; restore a live row instead of permanent delete",
    );

  const { error } = await admin.from(kind as "tasks").delete().eq("id", id);
  if (error) return internal(error.message);

  void emitEvent(`admin.trash.permanent_delete`, {
    actor_id: actorId,
    entity_type: kind.replace(/s$/, ""),
    entity_id: id,
    payload: { kind },
  });

  return new NextResponse(null, { status: 204 });
}

function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "Trash entry not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/admin/trash/:kind/:id",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/admin/trash/:kind/:id",
);
