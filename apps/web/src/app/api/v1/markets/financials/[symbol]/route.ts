import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { getFinancials } from "@/lib/markets/providers";
import type { StatementKind } from "@/lib/markets/providers/types";
import { isValidSymbol, normalizeSymbol } from "@/lib/markets/symbols";
import { badRequest, mapMarketError, ok, unauthorized } from "@/lib/markets/api";

interface Props {
  params: Promise<{ symbol: string }>;
}

const STATEMENTS: StatementKind[] = ["income", "balance", "cash"];

/** GET /api/v1/markets/financials/:symbol?statement=income — statements (cached 24h upstream). */
async function handleGet(request: NextRequest, { params }: Props) {
  const { symbol: raw } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const symbol = normalizeSymbol(decodeURIComponent(raw));
  if (!isValidSymbol(symbol)) return badRequest("Invalid symbol");

  const statement = (request.nextUrl.searchParams.get("statement") ??
    "income") as StatementKind;
  if (!STATEMENTS.includes(statement))
    return badRequest(`statement must be one of ${STATEMENTS.join(", ")}`);

  try {
    const report = await getFinancials(symbol, statement);
    return ok({ report });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/markets/financials/:symbol",
);
