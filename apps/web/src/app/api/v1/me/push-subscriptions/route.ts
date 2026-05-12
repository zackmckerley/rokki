import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { withObservability } from "@/lib/observability";
/**
 * GET  /api/v1/me/push-subscriptions          — list this user's subs
 * POST /api/v1/me/push-subscriptions  { endpoint, keys: { p256dh, auth } }
 *
 * Idempotent on (user_id, endpoint) — re-subscribing updates `last_seen_at`.
 */
async function handleGet() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, user_agent, created_at, last_seen_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ data: data ?? [] });
}

async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    user_agent?: string;
  };

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "invalid_request",
            message: "endpoint + keys.p256dh + keys.auth are required",
          },
        ],
      },
      { status: 400 },
    );
  }

  const row = {
    user_id: user.id,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth_secret: body.keys.auth,
    user_agent: body.user_agent?.slice(0, 300) ?? null,
    last_seen_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("endpoint", body.endpoint)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("push_subscriptions")
      // @ts-expect-error Phase 0 generics
      .update({ last_seen_at: row.last_seen_at, p256dh: row.p256dh, auth_secret: row.auth_secret })
      .eq("id", (existing as { id: string }).id);
  } else {
    const { error } = await supabase
      .from("push_subscriptions")
      // @ts-expect-error Phase 0 generics
      .insert(row);
    if (error)
      return NextResponse.json(
        { errors: [{ code: "internal_error", message: error.message }] },
        { status: 500 },
      );
  }

  return NextResponse.json({ data: { subscribed: true } }, { status: 201 });
}

async function handleDelete(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();
  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint");
  if (!endpoint) return bad("endpoint query param required");
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);
  return new NextResponse(null, { status: 204 });
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/me/push-subscriptions",
);
export const POST = withObservability(
  handlePost,
  "POST /api/v1/me/push-subscriptions",
);
export const DELETE = withObservability(
  handleDelete,
  "DELETE /api/v1/me/push-subscriptions",
);
