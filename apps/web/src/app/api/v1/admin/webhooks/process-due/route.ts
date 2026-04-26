import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { processDueDeliveries } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/webhooks/process-due
 *
 * Walks the `webhook_deliveries` queue for any rows whose
 * `next_attempt_at` has elapsed and attempts each. Designed to be
 * triggered by a cron or scheduled task — Vercel Cron, an external
 * scheduler, or a one-shot CLI hit.
 *
 * Two ways to authenticate:
 *   - Platform-admin session (the dashboard "Process now" button), OR
 *   - `x-cron-secret: $CRON_SECRET` header so a scheduler can hit it
 *     without an interactive session.
 *
 * Suggested cron cadence: every 1 minute. The work is idempotent — a
 * concurrent invocation can't double-deliver a row because each worker
 * claims rows by bumping the `attempt` counter atomically before the
 * outbound POST.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret");
  const cronAuthorized =
    !!cronSecret && !!headerSecret && headerSecret === cronSecret;

  if (!cronAuthorized) {
    const gate = await requireAdmin(request);
    if ("status" in gate) return gate;
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 200);

  const result = await processDueDeliveries(limit);
  return NextResponse.json({ data: result });
}
