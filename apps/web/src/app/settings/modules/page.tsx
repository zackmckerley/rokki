import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { ModulePrefsProvider } from "@/components/dashboard/module-visibility";
import { ModuleSettingsForm } from "@/components/settings/ModuleSettingsForm";
import { SettingsHeader } from "@/components/settings/settings-ui";

/**
 * Per-user module settings — the full-page version of the MODULES gear.
 * The prefs are per-user (localStorage + optional account sync), so this
 * page renders instantly with no server data fetch beyond the auth check.
 */
export default async function ModuleSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          Dashboard
        </Link>
        <span className="text-text-3">/</span>
        <span className="text-text-0">Module settings</span>
      </TopBar>
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <SettingsHeader
          title="Module settings"
          description="Choose which modules appear on your dashboard, their order, and how they behave."
        />
        <ModulePrefsProvider>
          <ModuleSettingsForm />
        </ModulePrefsProvider>
      </main>
    </div>
  );
}
