import { createClient } from "@/lib/supabase/server";
import {
  loadAssignedTasks,
  loadDelegatedTasks,
} from "@/lib/dashboard-queries";
import { TasksCard } from "./TasksCard";

interface Props {
  userId: string;
  tickerById: Record<string, string>;
  terminalNameById: Record<string, string>;
  createDisabled?: boolean;
  /**
   * Dashboard-level terminal scope filter. When set, tasks are
   * pre-filtered to only that terminal's work before being handed to
   * `TasksCard`. Null/undefined = no filter (show everything).
   */
  scopeTerminalId?: string | null;
  /**
   * Human label for the active scope ("Space → Terminal"), shown in the card
   * header when a focus filter is active. Null = generic "Tasks" header.
   */
  scopeLabel?: string | null;
}

/**
 * Server-Component wrapper around `TasksCard`. Owns the assigned +
 * delegated task fetch so the parent route can render this slot as a
 * separate Suspense boundary — fast cards (Briefing, Week) render
 * while this one is still loading, instead of the whole dashboard
 * waiting on the heaviest query.
 *
 * The card itself is still a Client Component (realtime hook, tab
 * state); we just hoist the data fetch out of the parent route's
 * monolithic Promise.all and into its own awaitable boundary.
 *
 * Filtering note: the assigned/delegated loaders are PostgREST joins
 * where adding a `tasks.terminal_id` filter requires embedded-resource
 * syntax that conflicts with how the join is shaped today. Cheaper
 * to post-filter after fetch — a focused dashboard still benefits
 * because the realtime / tab state stays consistent.
 */
export async function TasksCardServer({
  userId,
  tickerById,
  terminalNameById,
  createDisabled,
  scopeTerminalId,
  scopeLabel,
}: Props) {
  const supabase = await createClient();
  const [assignedRaw, delegatedRaw] = await Promise.all([
    loadAssignedTasks(supabase, userId),
    loadDelegatedTasks(supabase, userId),
  ]);
  const assigned = scopeTerminalId
    ? assignedRaw.filter((t) => t.terminal_id === scopeTerminalId)
    : assignedRaw;
  const delegated = scopeTerminalId
    ? delegatedRaw.filter((t) => t.terminal_id === scopeTerminalId)
    : delegatedRaw;
  return (
    <TasksCard
      assigned={assigned}
      delegated={delegated}
      tickerById={tickerById}
      terminalNameById={terminalNameById}
      createDisabled={createDisabled}
      scopeLabel={scopeLabel}
    />
  );
}
