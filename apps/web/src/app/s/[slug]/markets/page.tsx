import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { MarketsDashboard } from "@/modules/markets/components/MarketsDashboard";
import { loadPortfolios, loadWatchlists } from "@/modules/markets/lib/server-data";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function SpaceMarketsPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: spaceRow } = await supabase
    .from("spaces")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  const space = spaceRow as { id: string; name: string } | null;
  if (!space) redirect("/");

  const [watchlists, portfolios] = await Promise.all([
    loadWatchlists(supabase, "space", space.id),
    loadPortfolios(supabase, "space", space.id),
  ]);

  return (
    <ScopedModuleShell
      scopeKind="space"
      scopeKey={slug}
      activeSlug="markets"
      flagOffBehavior="render"
    >
      <MarketsDashboard
        scope="space"
        scopeId={space.id}
        initialWatchlists={watchlists}
        initialPortfolios={portfolios}
      />
    </ScopedModuleShell>
  );
}
