import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { PortfolioView } from "@/modules/markets/components/PortfolioView";
import { marketsDb } from "@/lib/markets/db";
import { getQuotesCached } from "@/lib/markets/cache";
import { computePerformance, computePositions } from "@/lib/markets/portfolio";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PortfolioPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const db = marketsDb(supabase);

  const { data: portfolio } = await db
    .from("mkt_portfolios")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!portfolio) redirect("/app/markets");

  const { data: lots } = await db
    .from("mkt_lots")
    .select("*")
    .eq("portfolio_id", id)
    .order("trade_date", { ascending: false });

  const ledger = lots ?? [];
  const positions = computePositions(ledger);
  const symbols = positions.filter((p) => p.quantity > 0).map((p) => p.symbol);
  const quotes = await getQuotesCached(symbols);
  const performance = computePerformance(positions, quotes);

  return (
    <ScopedModuleShell scopeKind="user" activeSlug="markets" flagOffBehavior="render">
      <PortfolioView initial={{ portfolio, lots: ledger, performance }} />
    </ScopedModuleShell>
  );
}
