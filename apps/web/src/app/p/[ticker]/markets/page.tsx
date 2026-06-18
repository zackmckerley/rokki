import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { MarketsDashboard } from "@/modules/markets/components/MarketsDashboard";
import { loadPortfolios, loadWatchlists } from "@/modules/markets/lib/server-data";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function TerminalMarketsPage({ params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const terminal = await resolveTerminalBySegment(supabase, ticker);
  if (!terminal) redirect("/");

  const [watchlists, portfolios] = await Promise.all([
    loadWatchlists(supabase, "terminal", terminal.id),
    loadPortfolios(supabase, "terminal", terminal.id),
  ]);

  return (
    <ScopedModuleShell
      scopeKind="terminal"
      scopeKey={ticker}
      activeSlug="markets"
      flagOffBehavior="render"
    >
      <MarketsDashboard
        scope="terminal"
        scopeId={terminal.id}
        initialWatchlists={watchlists}
        initialPortfolios={portfolios}
      />
    </ScopedModuleShell>
  );
}
