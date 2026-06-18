import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { SettingsHeader } from "@/components/settings/settings-ui";
import { SignalConnection } from "@/components/settings/SignalConnection";

/**
 * Messages module settings — per-module settings reached from the MODULES
 * gear (→ Module settings → Messages) or the Messages card header. Right now
 * this is where you connect external messaging: Signal.
 */
export default async function MessagesModuleSettingsPage() {
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
        <Link href="/settings/modules" className="text-text-3 hover:text-text-1">
          Module settings
        </Link>
        <span className="text-text-3">/</span>
        <span className="text-text-0">Messages</span>
      </TopBar>
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <SettingsHeader
          title="Messages"
          description="Connect external messaging to your Messages module. Link your own Signal account to send and receive from Rokki or your phone."
        />
        <SignalConnection />
      </main>
    </div>
  );
}
