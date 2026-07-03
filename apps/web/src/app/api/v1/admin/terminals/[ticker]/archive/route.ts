import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * POST   /api/v1/admin/terminals/:ticker/archive   → soft-archive
 * DELETE /api/v1/admin/terminals/:ticker/archive   → restore (clears archived_at)
 *
 * Admin variant: bypasses the terminal-owner/manager check that the
 * non-admin route enforces.
 */
async function handlePost(request: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const resolved = await resolveTerminalBySegment(admin, ticker);
  if (!resolved)
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "Terminal not found" }] },
      { status: 404 },
    );
  const t = resolved;

  const { error } = await admin
    .from("terminals")
    .update({
      archived_at: new Date().toISOString(),
      status: "archived",
    } as never)
    .eq("id", t.id);
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.terminal.archived", {
    actor_id: actorId,
    space_id: t.space_id,
    terminal_id: t.id,
    entity_type: "terminal",
    entity_id: t.id,
    payload: { ticker: t.ticker },
  });

  return NextResponse.json({ data: { archived: true } });
}

async function handleDelete(request: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  // Restore must find the *archived* row — the default resolver filters
  // archived terminals out, which made every restore 404.
  const resolved = await resolveTerminalBySegment(admin, ticker, {
    includeArchived: true,
  });
  if (!resolved)
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "Terminal not found" }] },
      { status: 404 },
    );
  // Fetch the status separately — the shared resolver returns the
  // common columns but not status, which the restore flow needs.
  const { data: statusRow } = await admin
    .from("terminals")
    .select("status")
    .eq("id", resolved.id)
    .maybeSingle();
  const t = {
    ...resolved,
    status:
      ((statusRow as { status?: string } | null)?.status as string) ?? "active",
  };

  const nextStatus = t.status === "archived" ? "active" : t.status;
  const { error } = await admin
    .from("terminals")
    .update({ archived_at: null, status: nextStatus } as never)
    .eq("id", t.id);
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.terminal.restored", {
    actor_id: actorId,
    space_id: t.space_id,
    terminal_id: t.id,
    entity_type: "terminal",
    entity_id: t.id,
    payload: { ticker: t.ticker },
  });

  return NextResponse.json({ data: { restored: true } });
}

export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/admin/terminals/:ticker/archive",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/admin/terminals/:ticker/archive",
);
