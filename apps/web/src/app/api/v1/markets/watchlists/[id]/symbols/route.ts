import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { marketsDb, type MktWatchlistSymbolRow } from "@/lib/markets/db";
import { isValidSymbol, normalizeSymbol } from "@/lib/markets/symbols";
import {
  badRequest,
  internal,
  noContent,
  ok,
  unauthorized,
} from "@/lib/markets/api";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST   /api/v1/markets/watchlists/:id/symbols   { symbol, note? } — add.
 * DELETE /api/v1/markets/watchlists/:id/symbols?symbol=AAPL          — remove.
 *
 * RLS on mkt_watchlist_symbols inherits the parent watchlist's visibility.
 */
async function handlePost(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const body = (await request.json().catch(() => ({}))) as {
    symbol?: string;
    note?: string;
  };
  const symbol = normalizeSymbol(body.symbol ?? "");
  if (!isValidSymbol(symbol)) return badRequest("Invalid symbol");
  const note = body.note?.trim().slice(0, 280) || null;

  const row: Partial<MktWatchlistSymbolRow> = {
    watchlist_id: id,
    symbol,
    note,
  };
  const { data, error } = await db
    .from("mkt_watchlist_symbols")
    .insert(row)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return badRequest("Symbol already on this watchlist");
    return internal(error.message);
  }
  return ok({ symbol: data }, 201);
}

async function handleDelete(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const symbol = normalizeSymbol(
    request.nextUrl.searchParams.get("symbol") ?? "",
  );
  if (!isValidSymbol(symbol)) return badRequest("Invalid symbol");

  const { error } = await db
    .from("mkt_watchlist_symbols")
    .delete()
    .eq("watchlist_id", id)
    .eq("symbol", symbol);
  if (error) return internal(error.message);
  return noContent();
}

export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/markets/watchlists/:id/symbols",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/markets/watchlists/:id/symbols",
);
