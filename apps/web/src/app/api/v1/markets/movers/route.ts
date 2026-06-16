import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { getMovers } from "@/lib/markets/providers";
import type { MoverKind } from "@/lib/markets/providers/types";
import { badRequest, mapMarketError, ok, unauthorized } from "@/lib/markets/api";

const KINDS: MoverKind[] = ["gainers", "losers", "active"];

/** GET /api/v1/markets/movers?type=gainers — top gainers/losers/most-active. */
async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const type = (request.nextUrl.searchParams.get("type") ?? "gainers") as MoverKind;
  if (!KINDS.includes(type))
    return badRequest(`type must be one of ${KINDS.join(", ")}`);

  try {
    const movers = await getMovers(type);
    return ok({ type, movers });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const GET = withObservability(handleGet, "GET /api/v1/markets/movers");
