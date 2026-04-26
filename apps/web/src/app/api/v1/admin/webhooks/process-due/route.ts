import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { claimAndProcess } from "@/lib/jobs";
import {
  WEBHOOK_DELIVERY_QUEUE,
  webhookDeliveryHandler,
} from "@/lib/webhooks";

/**
 * POST /api/v1/admin/webhooks/process-due
 *
 * Backwards-compat thin wrapper. Older cron jobs that pointed at this
 * URL still work; new deployments should hit /api/v1/admin/jobs/process
 * which iterates every queue.
 *
 * Dual-auth: admin session OR x-cron-secret. Same as the generic
 * worker endpoint.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const cronHeader = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  let allowed = !!cronHeader && !!expected && cronHeader === expected;

  if (!allowed) {
    const gate = await requireAdmin(request);
    if ("status" in gate) return gate;
    allowed = true;
  }
  if (!allowed) {
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in or supply x-cron-secret" }] },
      { status: 401 },
    );
  }

  try {
    const result = await claimAndProcess(WEBHOOK_DELIVERY_QUEUE, {
      [WEBHOOK_DELIVERY_QUEUE]: webhookDeliveryHandler,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: msg }] },
      { status: 500 },
    );
  }
}
