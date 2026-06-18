import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { getEarningsCalendar } from "@/lib/markets/providers";
import { badRequest, mapMarketError, ok, unauthorized } from "@/lib/markets/api";

/**
 * GET /api/v1/markets/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — earnings
 * calendar. Defaults to the next 7 days when no range is given.
 */
async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const sp = request.nextUrl.searchParams;
  const today = new Date();
  const weekOut = new Date(today.getTime() + 7 * 86400_000);
  const fromIso = sp.get("from") ?? today.toISOString().slice(0, 10);
  const toIso = sp.get("to") ?? weekOut.toISOString().slice(0, 10);

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(fromIso) || !dateRe.test(toIso))
    return badRequest("from/to must be YYYY-MM-DD");

  try {
    const events = await getEarningsCalendar(fromIso, toIso);
    return ok({ from: fromIso, to: toIso, events });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const GET = withObservability(handleGet, "GET /api/v1/markets/calendar");
