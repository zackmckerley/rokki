import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { AlertsView } from "@/modules/markets/components/AlertsView";
import { marketsDb } from "@/lib/markets/db";

export const metadata = { title: "Price Alerts — Rokki" };

export default async function AlertsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: alerts } = await marketsDb(supabase)
    .from("mkt_alerts")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <ScopedModuleShell scopeKind="user" activeSlug="markets" flagOffBehavior="render">
      <AlertsView initial={alerts ?? []} />
    </ScopedModuleShell>
  );
}
