/**
 * Goals module manifest.
 *
 * Goals is **dashboard-only**: the whole experience (every goal area, with the
 * week's progress and daily logging) lives in the Goals panel on the dashboard,
 * aggregated across all the scopes you can see. There is no per-scope detail
 * page, so Goals is not a space/terminal pane module and claims no F-key. The
 * sole `user` route points at `/modules/goals`, which redirects to the
 * dashboard — kept only so old links don't 404.
 */
import type { ModuleManifest } from "@rokki/sdk";

export const goalsManifest: ModuleManifest = {
  slug: "goals",
  name: "Goals",
  description: "Weekly numeric targets with daily entries.",
  icon: "target",
  scopes: ["user"],
  routes: {
    user: "/modules/goals",
  },
};
