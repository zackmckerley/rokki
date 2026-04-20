import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { AppearanceForm } from "./AppearanceForm";

export default async function AppearancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("preferences, settings")
    .eq("user_id", user.id)
    .maybeSingle();

  const row = data as {
    preferences: Record<string, unknown> | null;
    settings: Record<string, unknown> | null;
  } | null;

  // Prefer `preferences.density`; fall back to the legacy `settings.density`.
  const density =
    row?.preferences?.density === "compact" ||
    row?.settings?.density === "compact"
      ? "compact"
      : "cozy";

  const themeRaw = row?.preferences?.theme;
  const theme =
    themeRaw === "light" || themeRaw === "system" ? themeRaw : "dark";

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/settings" className="text-text-3 hover:text-text-1">
          ← Settings
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Appearance</span>
      </TopBar>
      <main className="mx-auto w-full max-w-2xl flex-1 p-6">
        <h1 className="mb-1 text-xl font-semibold text-text-0">Appearance</h1>
        <p className="mb-6 text-xs text-text-3">
          Density + display preferences. Changes apply on next page load.
        </p>
        <AppearanceForm initialDensity={density} initialTheme={theme} />
      </main>
    </div>
  );
}
