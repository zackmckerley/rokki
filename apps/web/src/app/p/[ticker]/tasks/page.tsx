import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { ScopedTaskList } from "@/components/modules/ScopedTaskList";
import { loadTasksForTerminal } from "@/lib/modules/tasks-queries";

interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * `/p/[ticker]/tasks` — terminal-scope tasks list.
 *
 * The existing `/p/[ticker]` landing surface (ProjectTerminal)
 * already shows tasks, but it bundles them with files, members, and
 * activity. This module-system route gives a single-surface tasks
 * view that lives at a stable URL — useful for deep-linking
 * ("send me your CASA tasks") and for the pane-shell's Tasks tab.
 */
export default async function TerminalTasksPage({ params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const terminal = await resolveTerminalBySegment(supabase, ticker);
  if (!terminal) redirect("/");

  const tasks = await loadTasksForTerminal(supabase, terminal.id);

  return (
    <ScopedModuleShell
      scopeKind="terminal"
      scopeKey={ticker}
      activeSlug="tasks"
      flagOffBehavior="render"
    >
      <ScopedTaskList
        tasks={tasks}
        title={`Tasks · ${terminal.name}`}
        emptyMessage={`No open tasks in ${terminal.name}.`}
      />
    </ScopedModuleShell>
  );
}
