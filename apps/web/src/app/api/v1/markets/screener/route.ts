import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { getQuotesCached } from "@/lib/markets/cache";
import { SCREENER_UNIVERSE } from "@/lib/markets/screener-universe";
import { isValidSymbol, normalizeSymbol } from "@/lib/markets/symbols";
import { badRequest, mapMarketError, ok, unauthorized } from "@/lib/markets/api";

interface ScreenerFilters {
  minPrice?: number;
  maxPrice?: number;
  minChangePct?: number;
  maxChangePct?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
}

/**
 * POST /api/v1/markets/screener — filter a candidate universe on fields we
 * have from free quotes (price, % change, market cap). Body:
 *   { universe?: string[], filters: ScreenerFilters, sort?, limit? }
 */
async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    universe?: string[];
    filters?: ScreenerFilters;
    sort?: "changePct" | "price" | "marketCap";
    limit?: number;
  };

  let universe = SCREENER_UNIVERSE;
  if (Array.isArray(body.universe) && body.universe.length > 0) {
    universe = body.universe.map(normalizeSymbol).filter(isValidSymbol);
    if (universe.length === 0) return badRequest("universe has no valid symbols");
    if (universe.length > 100) return badRequest("universe capped at 100 symbols");
  }

  const f = body.filters ?? {};
  const sort = body.sort ?? "changePct";
  const limit = Math.min(Math.max(body.limit ?? 50, 1), 100);

  try {
    const quotes = await getQuotesCached(universe, 60_000);
    let rows = Object.values(quotes).filter((q) => {
      if (f.minPrice !== undefined && q.price < f.minPrice) return false;
      if (f.maxPrice !== undefined && q.price > f.maxPrice) return false;
      if (f.minChangePct !== undefined && q.changePct < f.minChangePct) return false;
      if (f.maxChangePct !== undefined && q.changePct > f.maxChangePct) return false;
      if (f.minMarketCap !== undefined && (q.marketCap ?? 0) < f.minMarketCap) return false;
      if (f.maxMarketCap !== undefined && (q.marketCap ?? Infinity) > f.maxMarketCap) return false;
      return true;
    });

    rows = rows.sort((a, b) => {
      if (sort === "price") return b.price - a.price;
      if (sort === "marketCap") return (b.marketCap ?? 0) - (a.marketCap ?? 0);
      return b.changePct - a.changePct;
    });

    return ok({
      count: rows.length,
      results: rows.slice(0, limit),
      note: "Screens price / % change / market cap from free quotes. Fundamental filters (P/E, yield) require a paid feed.",
    });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const POST = withObservability(handlePost, "POST /api/v1/markets/screener");
