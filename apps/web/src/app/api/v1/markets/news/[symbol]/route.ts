import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { getNews } from "@/lib/markets/providers";
import { isValidSymbol, normalizeSymbol } from "@/lib/markets/symbols";
import { badRequest, mapMarketError, ok, unauthorized } from "@/lib/markets/api";

interface Props {
  params: Promise<{ symbol: string }>;
}

/** GET /api/v1/markets/news/:symbol?days=7 — recent company news. */
async function handleGet(request: NextRequest, { params }: Props) {
  const { symbol: raw } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const symbol = normalizeSymbol(decodeURIComponent(raw));
  if (!isValidSymbol(symbol)) return badRequest("Invalid symbol");

  const days = Number(request.nextUrl.searchParams.get("days") ?? "7");
  const sinceDays = Number.isFinite(days) ? Math.min(Math.max(days, 1), 60) : 7;

  try {
    const items = await getNews(symbol, sinceDays);
    return ok({ items });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/markets/news/:symbol",
);
