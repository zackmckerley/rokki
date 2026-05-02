import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runCalendarSyncForUser } from "@/lib/calendar-sync";

/**
 * POST /api/v1/calendar/sync-now
 *
 * User-facing companion to the cron-driven /api/v1/cron/calendar-sync
 * endpoint. Authorizes via the caller's Supabase session and only syncs
 * the caller's own connections — never anyone else's. Useful when the
 * user just (re)connected and wants to see events without waiting for
 * the next scheduled tick.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
      { status: 401 },
    );
  }
  const result = await runCalendarSyncForUser(user.id);
  return NextResponse.json({ data: result });
}
