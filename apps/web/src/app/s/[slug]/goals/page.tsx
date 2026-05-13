import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { GoalsView } from "@/components/modules/GoalsView";
import {
  loadCategories,
  loadGoals,
  loadCurrentTargets,
  sumWeekValues,
} from "@/lib/modules/goals-queries";
import { startOfWeek, endOfWeek } from "@/lib/modules/goals-week";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * `/s/[slug]/goals` — Goals module at space scope.
 *
 * Reads categories + goals + this-week totals from the goals_* tables
 * and renders the GoalsView. Logging values is wired through a thin
 * server-action wrapper so the read-mostly UI stays a Client
 * Component while writes go through RLS.
 */
export default async function SpaceGoalsPage({ params }: Props) {
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

  const today = new Date().toISOString().slice(0, 10);
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);

  const scope = { kind: "space" as const, spaceId: space.id };
  const [categories, goals] = await Promise.all([
    loadCategories(supabase, scope),
    loadGoals(supabase, scope),
  ]);
  const goalIds = goals.map((g) => g.id);
  const [targets, sums] = await Promise.all([
    loadCurrentTargets(supabase, goalIds, today),
    sumWeekValues(supabase, goalIds, weekStart, weekEnd),
  ]);
  const targetsByGoal = Object.fromEntries(targets.entries());
  const weekTotalsByGoal = Object.fromEntries(sums.entries());

  return (
    <ScopedModuleShell
      scopeKind="space"
      scopeKey={slug}
      activeSlug="goals"
      flagOffBehavior="render"
    >
      <GoalsView
        scope={{ kind: "space", spaceId: space.id, label: space.name }}
        categories={categories}
        goals={goals}
        targetsByGoal={targetsByGoal}
        weekTotalsByGoal={weekTotalsByGoal}
        weekRange={{ start: weekStart, end: weekEnd }}
      />
    </ScopedModuleShell>
  );
}
