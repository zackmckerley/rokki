import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { paneShellEnabled } from "@/lib/featureFlags";
import { PaneShellFixture } from "./PaneShellFixture";

/**
 * Phase 0 verification page for the pane-shell UI.
 *
 * Gated by the `pane_shell_enabled` feature flag — when the flag is
 * off, this route is invisible (404). When on, it renders a static
 * fixture matching `Claude/rokki-goals/public/sketch.html` so Zack
 * can dogfood the new pane shell without touching the live dashboard.
 *
 * Phase 1+ moves this into the real dashboard route, replacing the
 * current `app/page.tsx` shell. This page stays as a "what does the
 * fixture look like in isolation" reference.
 */
export default async function PaneShellDevPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Flag-gated. The middleware already requires auth for any non-public
  // route; we layer the feature flag on top so users who haven't been
  // opted-in see a 404 rather than a preview of unfinished UI.
  const enabled = await paneShellEnabled(user.id);
  if (!enabled) notFound();

  return <PaneShellFixture />;
}
