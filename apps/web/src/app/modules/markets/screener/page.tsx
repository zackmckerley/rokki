import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { ScreenerView } from "@/modules/markets/components/ScreenerView";

export const metadata = { title: "Screener — Rokki" };

export default async function ScreenerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <ScopedModuleShell scopeKind="user" activeSlug="markets" flagOffBehavior="render">
      <ScreenerView />
    </ScopedModuleShell>
  );
}
