import { createClient } from "@/lib/supabase/server";
import { loadWeekItems } from "@/lib/dashboard-queries";
import { WeekCard } from "./WeekCard";

/**
 * Server-Component wrapper around `WeekCard`. Owns the week-items
 * fetch (calendar events + tasks-as-due) so the rest of the
 * dashboard can render while this slot is still loading.
 *
 * `scopeTerminalId` is the dashboard's terminal-focus filter — when
 * set, the query pre-filters events to that terminal at the DB
 * level (single index lookup) instead of fetching the whole week
 * and throwing rows away client-side.
 */
export async function WeekCardServer({
  userId,
  scopeTerminalId,
}: {
  userId: string;
  scopeTerminalId?: string | null;
}) {
  const supabase = await createClient();
  const items = await loadWeekItems(supabase, userId, scopeTerminalId);
  return <WeekCard items={items} />;
}
