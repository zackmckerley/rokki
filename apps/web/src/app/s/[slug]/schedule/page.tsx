import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { WeekCard } from "@/components/dashboard/WeekCard";
import { loadWeekItems, loadWeekSources } from "@/lib/dashboard-queries";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * `/s/[slug]/schedule` — events across every terminal in this space.
 *
 * Phase 1: shows the next 7 days using the existing `WeekCard` —
 * matches the dashboard's "This week" treatment. Filter chips
 * (sources, today/week/month) are built into `WeekCard` already.
 *
 * Aggregating across terminals at the DB level requires joining
 * `calendar_events.terminal_id → terminals.space_id`. Phase 1 uses
 * the existing `loadWeekItems` and post-filters in memory — the
 * v2 query lives in the calendar-queries refactor once Schedule
 * gets its own page.
 */
export default async function SpaceSchedulePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: spaceRow } = await supabase
    .from("spaces")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  const space = spaceRow as { id: string; name: string } | null;
  if (!space) redirect("/");

  // List the space's terminals so we can post-filter items.
  const { data: terminalRows } = await supabase
    .from("terminals")
    .select("id")
    .eq("space_id", space.id)
    .is("archived_at", null);
  type Tx = { id: string };
  const terminalIds = new Set(((terminalRows ?? []) as Tx[]).map((t) => t.id));

  const [items, sources] = await Promise.all([
    loadWeekItems(supabase, user.id),
    loadWeekSources(supabase, user.id),
  ]);
  const filtered = items.filter(
    (i) => i.terminal_id && terminalIds.has(i.terminal_id),
  );

  return (
    <ScopedModuleShell
      scopeKind="space"
      scopeKey={slug}
      activeSlug="schedule"
      flagOffBehavior="render"
    >
      <div className="p-2 sm:p-3">
        <WeekCard
          items={filtered}
          sources={sources}
          range="week"
          hiddenSourceIds={[]}
        />
      </div>
    </ScopedModuleShell>
  );
}
