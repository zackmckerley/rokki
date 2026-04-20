import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { NotificationsForm, type NotificationPrefs } from "./NotificationsForm";

const DEFAULTS: NotificationPrefs = {
  digest_frequency: "instant",
  quiet_hours: null,
  kinds: {
    mention: true,
    assigned: true,
    invite: true,
    comment_reply: true,
    tool_result: true,
    system: true,
  },
};

export default async function NotificationPrefsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  const stored =
    ((data as { preferences?: Record<string, unknown> } | null)
      ?.preferences as Record<string, unknown> | undefined) ?? {};
  const storedPrefs =
    (stored.notifications as Partial<NotificationPrefs> | undefined) ?? {};

  const initial: NotificationPrefs = {
    digest_frequency:
      storedPrefs.digest_frequency ?? DEFAULTS.digest_frequency,
    quiet_hours: storedPrefs.quiet_hours ?? DEFAULTS.quiet_hours,
    kinds: { ...DEFAULTS.kinds, ...(storedPrefs.kinds ?? {}) },
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/settings" className="text-text-3 hover:text-text-1">
          ← Settings
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Notifications</span>
      </TopBar>
      <main className="mx-auto w-full max-w-2xl flex-1 p-6">
        <h1 className="mb-1 text-xl font-semibold text-text-0">
          Notifications
        </h1>
        <p className="mb-6 text-xs text-text-3">
          Which events reach your inbox + email, and when.
        </p>
        <NotificationsForm initial={initial} />
      </main>
    </div>
  );
}
