import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

import { withObservability } from "@/lib/observability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/webhooks/deliveries?destination_id=...&status=...
 *
 * Returns the most recent 100 deliveries (newest first), optionally
 * filtered by destination or by lifecycle status. Lifecycle is derived
 * from the timestamp columns rather than the `status` enum so the UI
 * can distinguish dead-lettered, in-flight, and delivered without
 * three round-trips.
 */
async function handleGet(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const destinationId = url.searchParams.get("destination_id");
  const lifecycle = url.searchParams.get("lifecycle"); // pending|delivered|dead

  let q = admin
    .from("webhook_deliveries")
    .select(
      "id, destination_id, event_name, attempt, status, response_code, last_error, next_attempt_at, attempted_at, delivered_at, dead_lettered_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (destinationId) q = q.eq("destination_id", destinationId);
  if (lifecycle === "delivered") q = q.not("delivered_at", "is", null);
  else if (lifecycle === "dead") q = q.not("dead_lettered_at", "is", null);
  else if (lifecycle === "pending")
    q = q.is("delivered_at", null).is("dead_lettered_at", null);

  const { data, error } = await q;
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  return NextResponse.json({ data: data ?? [] });
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/admin/webhooks/deliveries",
);
