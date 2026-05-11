import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
/**
 * POST /api/v1/admin/storage/cleanup-orphans
 *
 * Marks files as deleted_at when their parent terminal has been deleted
 * (the FK is ON DELETE CASCADE for the terminal_id, so an orphan in the
 * normal sense doesn't exist) — BUT files whose terminal is archived for
 * a long time and never restored can build up. This endpoint reports
 * + soft-deletes those, capped at 500 per call so a stuck cleanup
 * doesn't OOM the request.
 *
 * Returns a count of how many were swept. Does NOT delete bytes from
 * blob storage (that's a separate sweep the indexer can do later).
 */
async function handlePost(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  // Files attached to terminals archived ≥ 30 days ago, still
  // visible (not yet soft-deleted).
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: orphans, error: pickErr } = await admin
    .from("files")
    .select("id, filename, terminal_id, terminals!inner(archived_at)")
    .is("deleted_at", null)
    .lte("terminals.archived_at", cutoff)
    .limit(500);

  if (pickErr)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: pickErr.message }] },
      { status: 500 },
    );

  const ids = ((orphans ?? []) as { id: string }[]).map((o) => o.id);
  if (ids.length === 0)
    return NextResponse.json({ data: { swept: 0, capped: false } });

  const { error: updErr } = await admin
    .from("files")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: actorId,
    } as never)
    .in("id", ids);
  if (updErr)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: updErr.message }] },
      { status: 500 },
    );

  void emitEvent("admin.storage.orphans_cleaned", {
    actor_id: actorId,
    entity_type: "files",
    payload: { swept: ids.length, cutoff },
  });

  return NextResponse.json({
    data: {
      swept: ids.length,
      capped: ids.length === 500,
    },
  });
}

export const POST = withObservability(
  handlePost,
  "POST /api/v1/admin/storage/cleanup-orphans",
);
