import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { getFxRate } from "@/lib/markets/providers";
import { badRequest, mapMarketError, ok, unauthorized } from "@/lib/markets/api";

const CCY = /^[A-Za-z]{3}$/;

/** GET /api/v1/markets/fx?from=USD&to=EUR&amount=100 — currency converter. */
async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const sp = request.nextUrl.searchParams;
  const from = (sp.get("from") ?? "USD").toUpperCase();
  const to = (sp.get("to") ?? "EUR").toUpperCase();
  const amount = Number(sp.get("amount") ?? "1");
  if (!CCY.test(from) || !CCY.test(to))
    return badRequest("from/to must be 3-letter currency codes");
  if (!Number.isFinite(amount)) return badRequest("amount must be a number");

  try {
    const rate = await getFxRate(from, to);
    return ok({ from, to, rate, amount, converted: rate * amount });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const GET = withObservability(handleGet, "GET /api/v1/markets/fx");
