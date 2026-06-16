import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { MarketsBoard } from "@/modules/markets/components/MarketsBoard";

export const metadata = { title: "Markets Overview — Rokki" };

export default async function MarketsOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <ScopedModuleShell scopeKind="user" activeSlug="markets" flagOffBehavior="render">
      <MarketsBoard />
    </ScopedModuleShell>
  );
}
