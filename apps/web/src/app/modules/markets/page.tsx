import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { MarketsDashboard } from "@/modules/markets/components/MarketsDashboard";
import { loadPortfolios, loadWatchlists } from "@/modules/markets/lib/server-data";

export const metadata = { title: "Markets — Rokki" };

export default async function AppMarketsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [watchlists, portfolios] = await Promise.all([
    loadWatchlists(supabase, "user", user.id),
    loadPortfolios(supabase, "user", user.id),
  ]);

  return (
    <ScopedModuleShell scopeKind="user" activeSlug="markets" flagOffBehavior="render">
      <MarketsDashboard
        scope="user"
        initialWatchlists={watchlists}
        initialPortfolios={portfolios}
      />
    </ScopedModuleShell>
  );
}
