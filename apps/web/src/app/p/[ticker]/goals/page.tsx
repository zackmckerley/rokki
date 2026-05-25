import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";
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
  params: Promise<{ ticker: string }>;
}

/**
 * `/p/[ticker]/goals` — Goals at terminal scope. Same renderer as
 * the space view; just scoped to a single terminal's categories.
 */
export default async function TerminalGoalsPage({ params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const terminal = await resolveTerminalBySegment(supabase, ticker);
  if (!terminal) redirect("/");

  const today = new Date().toISOString().slice(0, 10);
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);

  const scope = { kind: "terminal" as const, terminalId: terminal.id };
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
      scopeKind="terminal"
      scopeKey={ticker}
      activeSlug="goals"
      flagOffBehavior="render"
    >
      <GoalsView
        scope={{
          kind: "terminal",
          terminalId: terminal.id,
          label: terminal.name,
        }}
        categories={categories}
        goals={goals}
        targetsByGoal={targetsByGoal}
        weekTotalsByGoal={weekTotalsByGoal}
        weekRange={{ start: weekStart, end: weekEnd }}
      />
    </ScopedModuleShell>
  );
}
