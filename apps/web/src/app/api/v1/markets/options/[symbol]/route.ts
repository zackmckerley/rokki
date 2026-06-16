import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { isValidSymbol, normalizeSymbol } from "@/lib/markets/symbols";
import { badRequest, ok, unauthorized } from "@/lib/markets/api";

interface Props {
  params: Promise<{ symbol: string }>;
}

/**
 * GET /api/v1/markets/options/:symbol — options chain.
 *
 * No provider in the configured FREE stack exposes an options chain, so this
 * degrades gracefully: it returns `{ supported: false }` with a clear message
 * rather than erroring, letting the UI show an upgrade hint. Wiring a paid
 * options feed is a one-adapter change (see providers/README in the plan).
 */
async function handleGet(_request: NextRequest, { params }: Props) {
  const { symbol: raw } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const symbol = normalizeSymbol(decodeURIComponent(raw));
  if (!isValidSymbol(symbol)) return badRequest("Invalid symbol");

  return ok({
    symbol,
    supported: false,
    expirations: [],
    contracts: [],
    note: "Options chains require a paid data feed; not available on the free tier.",
  });
}

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/markets/options/:symbol",
);
