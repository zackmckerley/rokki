import { NextResponse, type NextRequest } from "next/server";
import { runCalendarSyncTick } from "@/lib/calendar-sync";

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

export async function POST(request: NextRequest) {
  if (!authorize(request)) return unauthorized();

  const result = await runCalendarSyncTick();
  return NextResponse.json({ data: result });
}

// Also accept GET so a curl smoke test works without a body. The
// secret check still gates it.
export async function GET(request: NextRequest) {
  if (!authorize(request)) return unauthorized();
  const result = await runCalendarSyncTick();
  return NextResponse.json({ data: result });
}

function authorize(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // no secret configured = endpoint disabled
  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader === expected) return true;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${expected}`) return true;
  return false;
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
