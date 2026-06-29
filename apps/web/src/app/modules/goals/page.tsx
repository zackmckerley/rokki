import { redirect } from "next/navigation";

/**
 * Goals is a dashboard-only module now — the Goals panel on the dashboard is the
 * whole experience (every goal area, with daily logging, in one place). This
 * route is kept as a redirect so old links / the module nav land on the
 * dashboard instead of 404ing.
 */
export default function GoalsModuleRedirect() {
  redirect("/");
}
