/**
 * Tasks module manifest.
 *
 * Phase 0 stub — declares the module's slug, scopes, and target
 * routes. The actual routes (`/app/tasks`, `/s/[slug]/tasks`,
 * `/p/[ticker]/tasks`) are wired in Phase 1 by wrapping the existing
 * pages at `apps/web/src/app/tasks/` and `apps/web/src/app/p/[ticker]/task/`.
 *
 * Until then the pane shell can advertise this module in its tab
 * strip; clicking the tab is a no-op (the route doesn't resolve yet).
 */
import type { ModuleManifest } from "@rokki/sdk";

export const tasksManifest: ModuleManifest = {
  slug: "tasks",
  name: "Tasks",
  description: "Track to-dos with priorities, assignees, and due dates.",
  icon: "check-square",
  scopes: ["user", "space", "terminal"],
  routes: {
    user: "/app/tasks",
    space: "/s/[slug]/tasks",
    terminal: "/p/[ticker]/tasks",
  },
  fnKey: { label: "Tasks", default: 2 },
};
