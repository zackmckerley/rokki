import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

const SCOPES = ["global", "space", "user"] as const;

/**
 * GET  /api/v1/admin/flags
 * POST /api/v1/admin/flags  { key, scope, scope_id?, value, rollout_percentage?, description? }
 *      Upsert by (key, scope, scope_id).
 *
 * DELETE /api/v1/admin/flags?id=...
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;
  const { data } = await admin
    .from("feature_flags")
    .select(
      "id, key, scope, scope_id, value, rollout_percentage, description, updated_at, updated_by",
    )
    .order("key", { ascending: true });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;
  const body = (await request.json().catch(() => ({}))) as {
    key?: string;
    scope?: (typeof SCOPES)[number];
    scope_id?: string | null;
    value?: unknown;
    rollout_percentage?: number;
    description?: string;
  };

  const key = body.key?.trim();
  if (!key || !/^[a-z][a-z0-9_.-]{1,80}$/.test(key))
    return bad("key must be lowercase letters/digits/_./-");
  const scope = body.scope ?? "global";
  if (!SCOPES.includes(scope)) return bad("invalid scope");
  if (scope !== "global" && !body.scope_id)
    return bad("scope_id required for non-global scope");
  if (body.value === undefined) return bad("value required");
  const rollout = Math.min(
    Math.max(Math.round(body.rollout_percentage ?? 100), 0),
    100,
  );

  const row = {
    key,
    scope,
    scope_id: scope === "global" ? null : body.scope_id,
    value: body.value,
    rollout_percentage: rollout,
    description: body.description?.slice(0, 500) ?? null,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("feature_flags")
    .upsert(row as never, { onConflict: "key,scope,scope_id" })
    .select("*")
    .single();
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.flag.set", {
    actor_id: actorId,
    entity_type: "feature_flag",
    entity_id: (data as { id: string }).id,
    payload: {
      key,
      scope,
      scope_id: row.scope_id,
      value: row.value,
      rollout: rollout,
    },
  });

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return bad("id required");

  const { error } = await admin.from("feature_flags").delete().eq("id", id);
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.flag.deleted", {
    actor_id: actorId,
    entity_type: "feature_flag",
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
