import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
/**
 * POST /api/v1/admin/storage/rescan
 *   ?scope=stuck   re-queues files in 'pending' for >1h (assume stuck)
 *   ?scope=all     re-queues every file with status 'skipped' or 'pending'
 *   ?file_id=...   re-queue a single file
 *
 * Sets virus_scan_status back to 'pending' so the indexer's scan loop
 * picks them up on the next tick. Two-step (count → update) so the
 * response can report how many rows actually changed.
 */
async function handlePost(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "stuck";
  const fileId = url.searchParams.get("file_id");

  // Step 1 — count matching rows for the success message.
  let countQ = admin
    .from("files")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  if (fileId) {
    countQ = countQ.eq("id", fileId);
  } else if (scope === "all") {
    countQ = countQ.in("virus_scan_status", ["pending", "skipped"]);
  } else {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    countQ = countQ
      .eq("virus_scan_status", "pending")
      .lt("uploaded_at", cutoff);
  }
  const { count, error: countErr } = await countQ;
  if (countErr)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: countErr.message }] },
      { status: 500 },
    );

  // Step 2 — actually flip the rows.
  let updateQ = admin
    .from("files")
    .update({ virus_scan_status: "pending" } as never)
    .is("deleted_at", null);
  if (fileId) {
    updateQ = updateQ.eq("id", fileId);
  } else if (scope === "all") {
    updateQ = updateQ.in("virus_scan_status", ["pending", "skipped"]);
  } else {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    updateQ = updateQ
      .eq("virus_scan_status", "pending")
      .lt("uploaded_at", cutoff);
  }
  const { error } = await updateQ;
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.storage.rescan_queued", {
    actor_id: actorId,
    entity_type: "files",
    payload: { scope, file_id: fileId, requeued: count ?? 0 },
  });

  return NextResponse.json({
    data: { requeued: count ?? 0 },
  });
}

export const POST = withObservability(
  handlePost,
  "POST /api/v1/admin/storage/rescan",
);
