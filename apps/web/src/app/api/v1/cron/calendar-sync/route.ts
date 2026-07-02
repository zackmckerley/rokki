import { NextResponse, type NextRequest } from "next/server";
import { runCalendarSyncTick } from "@/lib/calendar-sync";
import { withObservability } from "@/lib/observability";
import { verifyCronSecret } from "@/lib/cron-auth";

/**
 * POST /api/v1/cron/calendar-sync
 *
 * Runs one calendar-sync tick: refresh tokens as needed, fetch the next
 * 14 days of events from each provider, upsert into calendar_events.
 *
 * Auth: requires `x-cron-secret` header matching CRON_SECRET, OR an
 * `Authorization: Bearer <CRON_SECRET>` header (Vercel Cron / GitHub
 * Actions style). The /api/v1/cron/* prefix is allowlisted in the auth
 * middleware specifically so cron callers (no user session) reach this
 * handler — the secret check is therefore the only thing standing
 * between an attacker and a sync trigger, and CRON_SECRET must be set
 * in production.
 *
 * Response: { data: { attempted, succeeded, failed, events } }
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handlePost(request: NextRequest) {
  if (!authorize(request)) return unauthorized();

  const result = await runCalendarSyncTick();
  return NextResponse.json({ data: result });
}

// Also accept GET so a curl smoke test works without a body. The
// secret check still gates it.
async function handleGet(request: NextRequest) {
  if (!authorize(request)) return unauthorized();
  const result = await runCalendarSyncTick();
  return NextResponse.json({ data: result });
}

export const POST = withObservability(
  handlePost,
  "POST /api/v1/cron/calendar-sync",
);
export const GET = withObservability(
  handleGet,
  "GET /api/v1/cron/calendar-sync",
);

function authorize(request: NextRequest): boolean {
  return verifyCronSecret(request);
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    {
      errors: [
        { code: "unauthenticated", message: "Supply a valid cron secret" },
      ],
    },
    { status: 401 },
  );
}
