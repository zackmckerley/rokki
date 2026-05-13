/**
 * Schedule module manifest.
 *
 * Phase 0 stub. Phase 1 renames `apps/web/src/app/calendar/` →
 * `apps/web/src/app/schedule/` (with a redirect on the old path) and
 * wraps it in the pane shell at `/app/schedule`. The terminal-scope
 * route already exists at `apps/web/src/app/p/[ticker]/schedule/` and
 * just needs the manifest wrap.
 *
 * Space view (`/s/[slug]/schedule`) is new and aggregates events
 * across that space's terminals.
 */
import type { ModuleManifest } from "@rokki/sdk";

export const scheduleManifest: ModuleManifest = {
  slug: "schedule",
  name: "Schedule",
  description:
    "Calendar of events, deadlines, milestones, and dependencies.",
  icon: "calendar",
  scopes: ["user", "space", "terminal"],
  routes: {
    user: "/app/schedule",
    space: "/s/[slug]/schedule",
    terminal: "/p/[ticker]/schedule",
  },
  fnKey: { label: "Schedule", default: 6 },
};
