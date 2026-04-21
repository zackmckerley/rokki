import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

const AUDIENCES = ["all", "admins", "space"] as const;

/**
 * GET  /api/v1/admin/announcements        → list all (admin only)
 * POST /api/v1/admin/announcements        { body, audience, audience_space_id?,
 *                                           starts_at?, ends_at?, dismissible? }
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;
  const { data } = await admin
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;
  const body = (await request.json().catch(() => ({}))) as {
    body?: string;
    audience?: (typeof AUDIENCES)[number];
    audience_space_id?: string | null;
    starts_at?: string;
    ends_at?: string | null;
    dismissible?: boolean;
  };

  const text = (body.body ?? "").trim();
  if (text.length < 1 || text.length > 4000) return bad("body must be 1–4000 chars");
  const audience = body.audience ?? "all";
  if (!AUDIENCES.includes(audience)) return bad("invalid audience");
  if (audience === "space" && !body.audience_space_id)
    return bad("audience_space_id required when audience=space");

  const row = {
    body: text,
    audience,
    audience_space_id: audience === "space" ? body.audience_space_id : null,
    starts_at: body.starts_at ?? new Date().toISOString(),
    ends_at:
      body.ends_at ??
      new Date(Date.now() + 7 * 86_400_000).toISOString(), // default 7d
    dismissible: body.dismissible ?? true,
    created_by: actorId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("announcements")
    .insert(row as never)
    .select("*")
    .single();
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.announcement.created", {
    actor_id: actorId,
    entity_type: "announcement",
    entity_id: (data as { id: string }).id,
    payload: { audience },
  });

  return NextResponse.json({ data }, { status: 201 });
}

function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}
