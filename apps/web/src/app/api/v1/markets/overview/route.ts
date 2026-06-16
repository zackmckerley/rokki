import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { getQuotesCached } from "@/lib/markets/cache";
import {
  OVERVIEW_COMMODITIES,
  OVERVIEW_FX,
  OVERVIEW_INDICES,
  OVERVIEW_SECTORS,
  type OverviewItem,
} from "@/lib/markets/overview";
import { mapMarketError, ok, unauthorized } from "@/lib/markets/api";
import type { Quote } from "@/lib/markets/providers/types";

interface BoardRow {
  symbol: string;
  label: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
}

function toRows(items: OverviewItem[], quotes: Record<string, Quote>): BoardRow[] {
  return items.map((it) => {
    const q = quotes[it.symbol];
    return {
      symbol: it.symbol,
      label: it.label,
      price: q?.price ?? null,
      change: q?.change ?? null,
      changePct: q?.changePct ?? null,
    };
  });
}

/**
 * GET /api/v1/markets/overview — indices, sectors, commodities, FX board.
 * One cached batch quote call (60s TTL — the board doesn't need 15s freshness).
 */
async function handleGet(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const all = [
    ...OVERVIEW_INDICES,
    ...OVERVIEW_SECTORS,
    ...OVERVIEW_COMMODITIES,
    ...OVERVIEW_FX,
  ];

  try {
    const quotes = await getQuotesCached(
      all.map((i) => i.symbol),
      60_000,
    );
    return ok({
      indices: toRows(OVERVIEW_INDICES, quotes),
      sectors: toRows(OVERVIEW_SECTORS, quotes),
      commodities: toRows(OVERVIEW_COMMODITIES, quotes),
      fx: toRows(OVERVIEW_FX, quotes),
    });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const GET = withObservability(handleGet, "GET /api/v1/markets/overview");
