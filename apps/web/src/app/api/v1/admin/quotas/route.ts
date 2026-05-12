import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
/**
 * GET  /api/v1/admin/quotas
 *   Lists every quota row with the tool slug joined for readability.
 *
 * POST /api/v1/admin/quotas
 *   { tool_id, subject_type ('user'|'org'), subject_id, period ('day'|'month'),
 *     limit_credits }
 *   Upserts (subject_type, subject_id, tool_id, period). Sets reset_at to
 *   the next boundary (midnight UTC tomorrow for day, first of next month
 *   for month).
 *
 * DELETE /api/v1/admin/quotas?id=...
 *   Removes a quota row.
 */
async function handleGet(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const { data: quotas } = await admin
    .from("quotas")
    .select(
      "id, subject_type, subject_id, tool_id, period, limit_credits, used_credits, reset_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(500);

  const rows = (quotas ?? []) as Array<{
    id: string;
    subject_type: string;
    subject_id: string;
    tool_id: string | null;
    period: string;
    limit_credits: number;
    used_credits: number;
    reset_at: string;
    updated_at: string;
  }>;
  const toolIds = Array.from(
    new Set(rows.map((r) => r.tool_id).filter(Boolean) as string[]),
  );
  const { data: tools } = toolIds.length
    ? await admin.from("tools").select("id, slug, name").in("id", toolIds)
    : { data: [] };
  const toolMap = new Map(
    ((tools ?? []) as { id: string; slug: string; name: string }[]).map(
      (t) => [t.id, t],
    ),
  );

  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      tool: r.tool_id ? toolMap.get(r.tool_id) ?? null : null,
    })),
  });
}

async function handlePost(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    tool_id?: string;
    subject_type?: "user" | "org";
    subject_id?: string;
    period?: "day" | "month";
    limit_credits?: number;
  };
  if (!body.subject_id || !body.tool_id) return bad("subject_id + tool_id required");
  const subjectType = body.subject_type ?? "user";
  const period = body.period ?? "day";
  if (subjectType !== "user" && subjectType !== "org")
    return bad("subject_type must be 'user' or 'org'");
  if (period !== "day" && period !== "month")
    return bad("period must be 'day' or 'month'");
  if (
    typeof body.limit_credits !== "number" ||
    body.limit_credits < 0 ||
    body.limit_credits > 10_000_000
  )
    return bad("limit_credits must be 0–10,000,000");

  const resetAt = nextResetAt(period);

  const { data, error } = await admin
    .from("quotas")
    .upsert(
      {
        tool_id: body.tool_id,
        subject_type: subjectType,
        subject_id: body.subject_id,
        period,
        limit_credits: body.limit_credits,
        reset_at: resetAt,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "subject_type,subject_id,tool_id,period" },
    )
    .select("id, limit_credits")
    .single();
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.quota.set", {
    actor_id: actorId,
    entity_type: "quota",
    entity_id: (data as { id: string }).id,
    payload: {
      tool_id: body.tool_id,
      subject: { type: subjectType, id: body.subject_id },
      period,
      limit_credits: body.limit_credits,
    },
  });

  return NextResponse.json({ data });
}

async function handleDelete(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return bad("id query param required");

  const { error } = await admin.from("quotas").delete().eq("id", id);
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );
  void emitEvent("admin.quota.deleted", {
    actor_id: actorId,
    entity_type: "quota",
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

function nextResetAt(period: "day" | "month"): string {
  const now = new Date();
  if (period === "day") {
    const next = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        0,
        0,
      ),
    );
    return next.toISOString();
  }
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0),
  );
  return next.toISOString();
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/admin/quotas",
);
export const POST = withObservability(
  handlePost,
  "POST /api/v1/admin/quotas",
);
export const DELETE = withObservability(
  handleDelete,
  "DELETE /api/v1/admin/quotas",
);
