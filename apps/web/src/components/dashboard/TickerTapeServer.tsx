import { createClient } from "@/lib/supabase/server";
import { TickerTape } from "@/components/TickerTape";
import { summarizeActivity } from "@/lib/activity-summary";

interface ActivityRow {
  id: string;
  action: string;
  actor_id: string | null;
  metadata: Record<string, unknown> | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
}

export type ActivityRange = "today" | "week" | "all";

/**
 * Server-Component wrapper for the activity ticker. Pulls the most
 * recent N activity rows and hands them to the (Client) TickerTape
 * for live streaming + tip injection.
 *
 * Hoisted out of `page.tsx`'s main Promise.all so the dashboard
 * shell + faster cards can paint before this query resolves.
 *
 * `range` narrows the initial query window:
 *   - "today" → activity since midnight local-equivalent (UTC midnight
 *     used here; precision is fine for a rolling ticker)
 *   - "week"  → last 7 days
 *   - "all"   → no time floor (default, original behaviour)
 *
 * The realtime channel itself doesn't filter by date — new rows
 * always stream in. The `range` only affects what's pre-loaded.
 */
export async function TickerTapeServer({
  projectId,
  range = "all",
}: {
  projectId?: string;
  range?: ActivityRange;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("activity")
    .select(
      "id, action, actor_id, metadata, before_json, after_json, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(30);
  if (projectId) {
    query = query.eq("terminal_id", projectId);
  }
  if (range !== "all") {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    if (range === "week") since.setDate(since.getDate() - 7);
    query = query.gte("created_at", since.toISOString());
  }
  const { data } = await query;
  const items = ((data ?? []) as ActivityRow[]).map((a) => ({
    id: a.id,
    text: summarizeActivity({
      action: a.action,
      metadata: a.metadata,
      before_json: a.before_json,
      after_json: a.after_json,
    }),
    when: relativeTime(a.created_at),
  }));
  return <TickerTape items={items} projectId={projectId} range={range} />;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
