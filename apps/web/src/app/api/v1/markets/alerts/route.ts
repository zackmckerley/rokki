import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { marketsDb, type MktAlertRow } from "@/lib/markets/db";
import { isValidSymbol, normalizeSymbol } from "@/lib/markets/symbols";
import { badRequest, internal, ok, unauthorized } from "@/lib/markets/api";

const CONDITIONS: MktAlertRow["condition"][] = [
  "price_above",
  "price_below",
  "pct_up",
  "pct_down",
];

/**
 * GET  /api/v1/markets/alerts — the user's price alerts.
 * POST /api/v1/markets/alerts — create one. Alerts are strictly personal (RLS).
 */
async function handleGet(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const { data, error } = await db
    .from("mkt_alerts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return internal(error.message);
  return ok({ alerts: data ?? [] });
}

async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  const db = marketsDb(supabase);

  const body = (await request.json().catch(() => ({}))) as {
    symbol?: string;
    condition?: MktAlertRow["condition"];
    threshold?: number;
    note?: string;
  };
  const symbol = normalizeSymbol(body.symbol ?? "");
  if (!isValidSymbol(symbol)) return badRequest("Invalid symbol");
  if (!body.condition || !CONDITIONS.includes(body.condition))
    return badRequest(`condition must be one of ${CONDITIONS.join(", ")}`);
  if (typeof body.threshold !== "number" || Number.isNaN(body.threshold))
    return badRequest("threshold must be a number");

  const row: Partial<MktAlertRow> = {
    user_id: user.id,
    symbol,
    condition: body.condition,
    threshold: body.threshold,
    note: body.note?.trim().slice(0, 280) || null,
  };
  const { data, error } = await db
    .from("mkt_alerts")
    .insert(row)
    .select("*")
    .single();
  if (error || !data) return internal(error?.message ?? "create failed");
  return ok({ alert: data }, 201);
}

export const GET = withObservability(handleGet, "GET /api/v1/markets/alerts");
export const POST = withObservability(handlePost, "POST /api/v1/markets/alerts");
