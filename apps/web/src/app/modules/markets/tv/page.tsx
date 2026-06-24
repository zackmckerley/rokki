import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { MarketsTV } from "@/modules/markets/components/MarketsTV";

export const metadata = { title: "Markets TV — Rokki" };

export default async function MarketsTvPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <ScopedModuleShell
      scopeKind="user"
      activeSlug="markets"
      flagOffBehavior="render"
    >
      <MarketsTV />
    </ScopedModuleShell>
  );
}
