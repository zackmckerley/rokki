import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { TasksCard } from "@/components/dashboard/TasksCard";
import {
  loadAssignedTasks,
  loadDelegatedTasks,
  loadDashTerminals,
} from "@/lib/dashboard-queries";

/**
 * `/modules/tasks` — user-scope tasks landing for the new module system.
 *
 * Reuses `TasksCard` so the data + interactions are identical to the
 * dashboard's tasks card. Wrapped in `ScopedModuleShell` so the
 * surrounding chrome (scope crumb, tab strip, ⋯ More overflow) comes
 * from the pane shell when the flag is on.
 *
 * When the flag is off this page redirects to the existing
 * `/tasks/mine` route — no need to render duplicate UI.
 */
export default async function AppTasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The flag check inside ScopedModuleShell determines whether we
  // render in the pane shell. To avoid pre-fetching the data twice
  // when the flag is off and we'd just redirect, do an early check
  // and redirect cleanly. ScopedModuleShell handles the on-path.
  const { paneShellEnabled } = await import("@/lib/featureFlags");
  if (!(await paneShellEnabled(user.id))) {
    redirect("/tasks/mine");
  }

  const [assigned, delegated, terminals] = await Promise.all([
    loadAssignedTasks(supabase, user.id),
    loadDelegatedTasks(supabase, user.id),
    loadDashTerminals(supabase),
  ]);
  // Values are slugs (URL-friendly), prop name stays for legacy parity.
  const tickerById = Object.fromEntries(terminals.map((t) => [t.id, t.slug]));
  const terminalNameById = Object.fromEntries(
    terminals.map((t) => [t.id, t.name]),
  );

  return (
    <ScopedModuleShell scopeKind="user" activeSlug="tasks">
      <div className="p-4">
        <TasksCard
          assigned={assigned}
          delegated={delegated}
          tickerById={tickerById}
          terminalNameById={terminalNameById}
          createDisabled={terminals.length === 0}
        />
      </div>
    </ScopedModuleShell>
  );
}
