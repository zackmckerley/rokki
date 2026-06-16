import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { getCandles } from "@/lib/markets/providers";
import type { Range } from "@/lib/markets/providers/types";
import { isValidSymbol, normalizeSymbol } from "@/lib/markets/symbols";
import { badRequest, mapMarketError, ok, unauthorized } from "@/lib/markets/api";

interface Props {
  params: Promise<{ symbol: string }>;
}

const RANGES: Range[] = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"];

/**
 * GET /api/v1/markets/candles/:symbol?range=1Y — OHLC series for the chart.
 */
async function handleGet(request: NextRequest, { params }: Props) {
  const { symbol: raw } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const symbol = normalizeSymbol(decodeURIComponent(raw));
  if (!isValidSymbol(symbol)) return badRequest("Invalid symbol");

  const rangeParam = (request.nextUrl.searchParams.get("range") ?? "1Y") as Range;
  if (!RANGES.includes(rangeParam))
    return badRequest(`range must be one of ${RANGES.join(", ")}`);

  try {
    const candles = await getCandles(symbol, rangeParam);
    return ok({ symbol, range: rangeParam, candles });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/markets/candles/:symbol",
);
