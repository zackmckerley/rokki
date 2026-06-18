import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { marketsDb, type MktLotRow, type MktPortfolioRow } from "@/lib/markets/db";
import { getQuotesCached } from "@/lib/markets/cache";
import { computePerformance, computePositions } from "@/lib/markets/portfolio";
import {
  badRequest,
  internal,
  noContent,
  notFound,
  ok,
  unauthorized,
} from "@/lib/markets/api";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET    /api/v1/markets/portfolios/:id — portfolio + lots + live performance.
 * PATCH  /api/v1/markets/portfolios/:id — rename / change base currency.
 * DELETE /api/v1/markets/portfolios/:id — delete (cascades lots).
 */
async function handleGet(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const { data: portfolio, error } = await db
    .from("mkt_portfolios")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return internal(error.message);
  if (!portfolio) return notFound("Portfolio not found");

  const { data: lots } = await db
    .from("mkt_lots")
    .select("*")
    .eq("portfolio_id", id)
    .order("trade_date");

  const ledger = (lots ?? []) as MktLotRow[];
  const positions = computePositions(ledger);
  const symbols = positions.filter((p) => p.quantity > 0).map((p) => p.symbol);
  const quotes = await getQuotesCached(symbols);
  const performance = computePerformance(positions, quotes);

  return ok({ portfolio, lots: ledger, performance });
}

async function handlePatch(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    baseCurrency?: string;
  };
  const patch: Partial<MktPortfolioRow> = {};
  if (body.name !== undefined) {
    const n = body.name.trim();
    if (!n) return badRequest("name cannot be empty");
    if (n.length > 80) return badRequest("name must be ≤ 80 characters");
    patch.name = n;
  }
  if (body.baseCurrency !== undefined) {
    patch.base_currency = body.baseCurrency.toUpperCase().slice(0, 3);
  }
  if (Object.keys(patch).length === 0) return badRequest("no fields to update");

  const { data, error } = await db
    .from("mkt_portfolios")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return internal(error.message);
  if (!data) return notFound("Portfolio not found");
  return ok({ portfolio: data });
}

async function handleDelete(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const { error } = await db.from("mkt_portfolios").delete().eq("id", id);
  if (error) return internal(error.message);
  return noContent();
}

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/markets/portfolios/:id",
);
export const PATCH = withObservability<Props>(
  handlePatch,
  "PATCH /api/v1/markets/portfolios/:id",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/markets/portfolios/:id",
);
