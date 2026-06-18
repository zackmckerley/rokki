import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { getQuotesCached } from "@/lib/markets/cache";
import { isValidSymbol, normalizeSymbol } from "@/lib/markets/symbols";
import { badRequest, mapMarketError, ok, unauthorized } from "@/lib/markets/api";

/**
 * GET /api/v1/markets/quotes?symbols=AAPL,MSFT,NVDA — batch quotes for a
 * watchlist. One call, cache-served, so a 30-row watchlist isn't 30 requests.
 */
async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const raw = request.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = raw
    .split(",")
    .map((s) => normalizeSymbol(s))
    .filter((s) => s && isValidSymbol(s));
  if (symbols.length === 0) return badRequest("symbols is required");
  if (symbols.length > 100) return badRequest("max 100 symbols per request");

  try {
    const quotes = await getQuotesCached(symbols);
    return ok({ quotes });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const GET = withObservability(handleGet, "GET /api/v1/markets/quotes");
