import { redirect } from "next/navigation";

/**
 * Goals is dashboard-only now — there is no per-scope detail page. The Goals
 * panel on the dashboard aggregates every scope's goals. Redirect any old
 * terminal-scoped link to the dashboard.
 */
export default function TerminalGoalsRedirect() {
  redirect("/");
}
