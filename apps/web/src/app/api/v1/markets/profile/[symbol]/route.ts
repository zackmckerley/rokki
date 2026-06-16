import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { getProfile } from "@/lib/markets/providers";
import { isValidSymbol, normalizeSymbol } from "@/lib/markets/symbols";
import { badRequest, mapMarketError, ok, unauthorized } from "@/lib/markets/api";

interface Props {
  params: Promise<{ symbol: string }>;
}

/** GET /api/v1/markets/profile/:symbol — company profile / fundamentals header. */
async function handleGet(_request: NextRequest, { params }: Props) {
  const { symbol: raw } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const symbol = normalizeSymbol(decodeURIComponent(raw));
  if (!isValidSymbol(symbol)) return badRequest("Invalid symbol");

  try {
    const profile = await getProfile(symbol);
    return ok({ profile });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/markets/profile/:symbol",
);
