import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, mapMarketError } from "@/lib/markets/api";
import { getRatesBoard, ratesAvailable } from "@/lib/markets/rates";

// Reads the FRED key + pulls fresh observations (cached an hour internally).
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/markets/rates
 *
 * Auth-gated. Returns the benchmark rates board (Treasury yields + SOFR/Prime/
 * Fed Funds) from FRED, and whether FRED_API_KEY is configured. Degrades to
 * `{ configured: false, board: null }` (not an error) when no key is set, so
 * the UI can show an "add a free key" prompt.
 */
async function handleGet() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  if (!ratesAvailable()) {
    return ok({ configured: false, board: null });
  }
  try {
    const board = await getRatesBoard();
    return ok({ configured: true, board });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const GET = withObservability(handleGet, "GET /api/v1/markets/rates");
