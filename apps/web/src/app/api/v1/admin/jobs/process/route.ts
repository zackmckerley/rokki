import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  claimAndProcess,
  type JobHandler,
  type ProcessResult,
} from "@/lib/jobs";
import {
  WEBHOOK_DELIVERY_QUEUE,
  webhookDeliveryHandler,
} from "@/lib/webhooks";
import { emitEvent } from "@/lib/events";

import { withObservability } from "@/lib/observability";
/**
 * POST /api/v1/admin/jobs/process
 *
 * The cron tick. Iterates every registered queue, claims a batch, runs
 * the handlers, and reports counts.
 *
 * Dual-auth (same pattern the webhook process-due endpoint uses):
 *   - Authenticated platform admin (cookie or bearer with admin
 *     profile) → for manual "kick the queue" from the admin UI.
 *   - x-cron-secret header matching CRON_SECRET env var → for the
 *     scheduled tick (Vercel Cron, GH Actions schedule, pg_cron HTTP
 *     post via pg_net, whatever the deployment uses).
 *
 * The endpoint is intentionally thin — all queue logic lives in
 * apps/web/src/lib/jobs.ts. To add a new queue, register it in
 * the HANDLERS map below.
 */

export const dynamic = "force-dynamic";

const HANDLERS: Record<string, JobHandler> = {
  [WEBHOOK_DELIVERY_QUEUE]: webhookDeliveryHandler,
  // Add more queue handlers here.
};

interface ProcessBody {
  /** Restrict to a single queue (admin "kick the queue" UI uses this). */
  queue?: string;
  /** Per-queue batch size override. */
  batchSize?: number;
}

async function handlePost(request: NextRequest) {
  if (!(await authorize(request))) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as ProcessBody;
  const queues = body.queue ? [body.queue] : Object.keys(HANDLERS);

  const results: ProcessResult[] = [];
  let processed = 0;
  let failed = 0;
  let dead = 0;
  for (const q of queues) {
    if (!HANDLERS[q]) {
      results.push({ queue: q, processed: 0, failed: 0, dead: 0, skipped: true });
      continue;
    }
    try {
      const r = await claimAndProcess(q, HANDLERS, {
        batchSize: body.batchSize,
      });
      results.push(r);
      processed += r.processed;
      failed += r.failed;
      dead += r.dead;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        queue: q,
        processed: 0,
        failed: 0,
        dead: 0,
        skipped: true,
      });
      void emitEvent("admin.jobs.process_error", {
        payload: { queue: q, error: message.slice(0, 500) },
      });
    }
  }

  return NextResponse.json({
    data: {
      processed,
      failed,
      dead,
      queues: results,
    },
  });
}

/**
 * Authorize either as an admin session or via the cron secret.
 * Returns true if the request is allowed.
 */
async function authorize(request: NextRequest): Promise<boolean> {
  const cronHeader = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (cronHeader && expected && cronHeader === expected) return true;

  // Vercel Cron also signs requests with its own bearer; accept that as
  // an alternative if configured (matches the webhook process-due
  // pattern).
  if (process.env.VERCEL && expected) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth === `Bearer ${expected}`) return true;
  }

  const gate = await requireAdmin(request);
  // requireAdmin returns a NextResponse on failure ("status" in gate)
  // or AdminContext on success.
  return !("status" in gate);
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in or supply x-cron-secret" }] },
    { status: 401 },
  );
}

export const POST = withObservability(
  handlePost,
  "POST /api/v1/admin/jobs/process",
);
