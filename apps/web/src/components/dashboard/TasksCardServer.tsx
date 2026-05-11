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
 */
export async function TasksCardServer({
  userId,
  tickerById,
  terminalNameById,
  createDisabled,
}: Props) {
  const supabase = await createClient();
  const [assigned, delegated] = await Promise.all([
    loadAssignedTasks(supabase, userId),
    loadDelegatedTasks(supabase, userId),
  ]);
  return (
    <TasksCard
      assigned={assigned}
      delegated={delegated}
      tickerById={tickerById}
      terminalNameById={terminalNameById}
      createDisabled={createDisabled}
    />
  );
}
