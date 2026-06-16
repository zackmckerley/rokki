import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { searchSymbols } from "@/lib/markets/providers";
import { badRequest, mapMarketError, ok, unauthorized } from "@/lib/markets/api";

/**
 * GET /api/v1/markets/search?q=apple — symbol search for the `⌘K` palette
 * and the watchlist add box.
 */
async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return badRequest("Query `q` is required");
  if (q.length > 64) return badRequest("Query too long");

  try {
    const matches = await searchSymbols(q);
    return ok({ matches });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const GET = withObservability(handleGet, "GET /api/v1/markets/search");
