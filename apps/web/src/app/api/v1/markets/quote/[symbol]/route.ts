import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { getQuoteCached } from "@/lib/markets/cache";
import { isValidSymbol, normalizeSymbol } from "@/lib/markets/symbols";
import { badRequest, mapMarketError, ok, unauthorized } from "@/lib/markets/api";

interface Props {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/v1/markets/quote/:symbol — normalized quote, served from the
 * TTL'd cache (15s) so free-tier provider limits are respected.
 *
 * Spec: MARKETS_MODULE_PLAN.md §7
 */
async function handleGet(_request: NextRequest, { params }: Props) {
  const { symbol: raw } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const symbol = normalizeSymbol(decodeURIComponent(raw));
  if (!isValidSymbol(symbol)) return badRequest("Invalid symbol");

  try {
    const { quote, cached } = await getQuoteCached(symbol);
    return ok({ quote, cached });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/markets/quote/:symbol",
);
