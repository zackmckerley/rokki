import { createClient } from "@/lib/supabase/server";
import { loadWeekItems } from "@/lib/dashboard-queries";
import { WeekCard } from "./WeekCard";

/**
 * Server-Component wrapper around `WeekCard`. Owns the week-items
 * fetch (calendar events + tasks-as-due) so the rest of the
 * dashboard can render while this slot is still loading.
 */
export async function WeekCardServer({ userId }: { userId: string }) {
  const supabase = await createClient();
  const items = await loadWeekItems(supabase, userId);
  return <WeekCard items={items} />;
}
