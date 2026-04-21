import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

interface Props {
  params: Promise<{ key: string }>;
}

/**
 * GET /api/v1/admin/config/:key   — fetch a platform_config value
 * PUT /api/v1/admin/config/:key   { value }  — upsert
 *
 * Used by the legal pages, branding picker, default-prefs editor.
 */
export async function GET(request: NextRequest, { params }: Props) {
  const { key } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;
  const { data } = await admin
    .from("platform_config")
    .select("key, value, updated_at, updated_by")
    .eq("key", key)
    .maybeSingle();
  return NextResponse.json({ data: data ?? null });
}

export async function PUT(request: NextRequest, { params }: Props) {
  const { key } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;
  const body = (await request.json().catch(() => ({}))) as { value?: unknown };
  if (body.value === undefined)
    return NextResponse.json(
      { errors: [{ code: "invalid_request", message: "value required" }] },
      { status: 400 },
    );

  const { error } = await admin
    .from("platform_config")
    .upsert(
      {
        key,
        value: body.value,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "key" },
    );
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.config.updated", {
    actor_id: actorId,
    entity_type: "platform_config",
    entity_id: key,
    payload: {},
  });

  return NextResponse.json({ data: { key } });
}
