import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";
import crypto from "node:crypto";

/**
 * GET  /api/v1/admin/webhooks
 * POST /api/v1/admin/webhooks  { url, events[], owner_space_id?, description?, active? }
 *
 * Secrets are auto-generated server-side and returned ONCE on insert.
 *
 * NOTE: actual outbound delivery is the indexer/queue's job. This endpoint
 * just manages the configuration.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;
  const { data } = await admin
    .from("webhook_destinations")
    .select(
      "id, url, events, active, owner_space_id, description, created_by, created_at, updated_at",
    )
    .order("created_at", { ascending: false });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;
  const body = (await request.json().catch(() => ({}))) as {
    url?: string;
    events?: string[];
    owner_space_id?: string | null;
    description?: string;
    active?: boolean;
  };

  const url = body.url?.trim();
  if (!url || !/^https?:\/\//.test(url)) return bad("valid http(s) URL required");
  if (!Array.isArray(body.events) || body.events.length === 0)
    return bad("events array required (e.g. ['terminal.created'])");

  const secret = `whsec_${crypto.randomBytes(24).toString("base64url")}`;

  const row = {
    url,
    secret,
    events: body.events,
    owner_space_id: body.owner_space_id ?? null,
    active: body.active ?? true,
    description: body.description?.slice(0, 500) ?? null,
    created_by: actorId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("webhook_destinations")
    .insert(row as never)
    .select(
      "id, url, events, active, owner_space_id, description, created_at",
    )
    .single();
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.webhook.created", {
    actor_id: actorId,
    space_id: body.owner_space_id ?? undefined,
    entity_type: "webhook",
    entity_id: (data as { id: string }).id,
    payload: { url, events: body.events },
  });

  // Return the secret ONCE — it's HMAC, so the recipient needs it.
  return NextResponse.json(
    { data: { ...data, secret } },
    { status: 201 },
  );
}

function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}
