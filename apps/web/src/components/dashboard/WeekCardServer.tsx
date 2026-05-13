import { createClient } from "@/lib/supabase/server";
import {
  loadWeekItems,
  loadWeekSources,
  type WeekRange,
} from "@/lib/dashboard-queries";
import { WeekCard } from "./WeekCard";

/**
 * Server-Component wrapper around `WeekCard`. Owns the week-items
 * fetch (calendar events) and the source-list fetch so the card can
 * render filter chips without a follow-up roundtrip.
 *
 * Filters that change the underlying query (scope, range, hidden
 * sources) are URL-driven and threaded in from the parent route. The
 * card itself only mutates the URL via Link clicks; the server
 * re-runs and feeds fresh data.
 */
export async function WeekCardServer({
  userId,
  scopeTerminalId,
  range,
  hiddenSourceIds,
}: {
  userId: string;
  scopeTerminalId?: string | null;
  range: WeekRange;
  hiddenSourceIds: string[];
}) {
  const supabase = await createClient();
  const [items, sources] = await Promise.all([
    loadWeekItems(supabase, userId, scopeTerminalId, range, hiddenSourceIds),
    loadWeekSources(supabase, userId),
  ]);
  return (
    <WeekCard
      items={items}
      sources={sources}
      range={range}
      hiddenSourceIds={hiddenSourceIds}
    />
  );
}
