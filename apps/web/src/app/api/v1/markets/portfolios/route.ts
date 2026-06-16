import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { marketsDb, type MktPortfolioRow, type ScopeKind } from "@/lib/markets/db";
import { badRequest, internal, ok, unauthorized } from "@/lib/markets/api";

const SCOPES: ScopeKind[] = ["user", "space", "terminal"];

/**
 * GET  /api/v1/markets/portfolios?scope=&scopeId= — list portfolios at a scope.
 * POST /api/v1/markets/portfolios — create a portfolio.
 */
async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const scope = (request.nextUrl.searchParams.get("scope") ?? "user") as ScopeKind;
  if (!SCOPES.includes(scope)) return badRequest("invalid scope");
  const scopeId = request.nextUrl.searchParams.get("scopeId");

  let query = db
    .from("mkt_portfolios")
    .select("*")
    .is("archived_at", null)
    .order("created_at");
  if (scope === "user") query = query.eq("user_id", user.id);
  else if (scope === "space") {
    if (!scopeId) return badRequest("scopeId required for space scope");
    query = query.eq("space_id", scopeId);
  } else {
    if (!scopeId) return badRequest("scopeId required for terminal scope");
    query = query.eq("terminal_id", scopeId);
  }

  const { data, error } = await query;
  if (error) return internal(error.message);
  return ok({ portfolios: data ?? [] });
}

async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    baseCurrency?: string;
    scope?: ScopeKind;
    scopeId?: string;
  };
  const name = body.name?.trim();
  if (!name) return badRequest("name is required");
  if (name.length > 80) return badRequest("name must be ≤ 80 characters");
  const scope = body.scope ?? "user";
  if (!SCOPES.includes(scope)) return badRequest("invalid scope");

  const row: Partial<MktPortfolioRow> = {
    name,
    base_currency: (body.baseCurrency ?? "USD").toUpperCase().slice(0, 3),
    created_by: user.id,
  };
  if (scope === "user") row.user_id = user.id;
  else if (scope === "space") {
    if (!body.scopeId) return badRequest("scopeId required for space scope");
    row.space_id = body.scopeId;
  } else {
    if (!body.scopeId) return badRequest("scopeId required for terminal scope");
    row.terminal_id = body.scopeId;
  }

  const { data, error } = await db
    .from("mkt_portfolios")
    .insert(row)
    .select("*")
    .single();
  if (error || !data) return internal(error?.message ?? "create failed");
  return ok({ portfolio: data }, 201);
}

export const GET = withObservability(handleGet, "GET /api/v1/markets/portfolios");
export const POST = withObservability(handlePost, "POST /api/v1/markets/portfolios");
