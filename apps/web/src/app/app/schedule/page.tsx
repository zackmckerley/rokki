import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { paneShellEnabled } from "@/lib/featureFlags";

/**
 * `/app/schedule` — Phase 1 redirect to the existing `/calendar`.
 *
 * The calendar page is feature-complete and already drives every
 * acceptance item for the Schedule module's user view. Rather than
 * wrap it (and risk hydration surprises), redirect for now and
 * inline the wrap in a follow-up once the calendar page itself
 * becomes module-aware.
 *
 * Behind the flag, users still land here from the pane-shell's
 * Schedule tab; we hop them straight to `/calendar` and that page
 * renders as it does today.
 */
export default async function AppSchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Flag-on or flag-off, the destination is the same in Phase 1.
  // The PaneShell wrap of Calendar lands in a follow-up.
  await paneShellEnabled(user.id);
  redirect("/calendar");
}
