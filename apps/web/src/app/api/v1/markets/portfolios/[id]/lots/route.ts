import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { marketsDb, type MktLotRow } from "@/lib/markets/db";
import { isValidSymbol, normalizeSymbol } from "@/lib/markets/symbols";
import { badRequest, internal, ok, unauthorized } from "@/lib/markets/api";

interface Props {
  params: Promise<{ id: string }>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET  /api/v1/markets/portfolios/:id/lots — list lots.
 * POST /api/v1/markets/portfolios/:id/lots — add a lot.
 */
async function handleGet(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const { data, error } = await db
    .from("mkt_lots")
    .select("*")
    .eq("portfolio_id", id)
    .order("trade_date", { ascending: false });
  if (error) return internal(error.message);
  return ok({ lots: data ?? [] });
}

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
    side?: string;
    quantity?: number;
    price?: number;
    fees?: number;
    tradeDate?: string;
    note?: string;
  };

  const symbol = normalizeSymbol(body.symbol ?? "");
  if (!isValidSymbol(symbol)) return badRequest("Invalid symbol");
  if (body.side !== "buy" && body.side !== "sell")
    return badRequest("side must be 'buy' or 'sell'");
  if (typeof body.quantity !== "number" || body.quantity <= 0)
    return badRequest("quantity must be a positive number");
  if (typeof body.price !== "number" || body.price < 0)
    return badRequest("price must be a non-negative number");
  if (body.fees !== undefined && (typeof body.fees !== "number" || body.fees < 0))
    return badRequest("fees must be a non-negative number");
  const tradeDate = body.tradeDate ?? new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(tradeDate)) return badRequest("tradeDate must be YYYY-MM-DD");

  const row: Partial<MktLotRow> = {
    portfolio_id: id,
    symbol,
    side: body.side,
    quantity: body.quantity,
    price: body.price,
    fees: body.fees ?? 0,
    trade_date: tradeDate,
    note: body.note?.trim().slice(0, 280) || null,
  };
  const { data, error } = await db
    .from("mkt_lots")
    .insert(row)
    .select("*")
    .single();
  if (error || !data) return internal(error?.message ?? "create failed");
  return ok({ lot: data }, 201);
}

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/markets/portfolios/:id/lots",
);
export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/markets/portfolios/:id/lots",
);
