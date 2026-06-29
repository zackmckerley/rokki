"use client";

import { useCallback, useEffect, useState } from "react";
import { Target } from "lucide-react";
import { DashboardCard } from "./DashboardCard";
import { GoalsView } from "@/components/modules/GoalsView";
import { createClient } from "@/lib/supabase/client";
import {
  loadAllVisibleCategories,
  loadGoalsForCategories,
  loadCurrentTargets,
  sumWeekValues,
  recordEntry,
  type GoalsCategoryRow,
  type GoalsGoalRow,
} from "@/lib/modules/goals-queries";
import { startOfWeek, endOfWeek, formatWeekLabel } from "@/lib/modules/goals-week";

interface Loaded {
  categories: GoalsCategoryRow[];
  goals: GoalsGoalRow[];
  targetsByGoal: Record<string, number>;
  weekTotalsByGoal: Record<string, number>;
  weekLabel: string;
}

/** Today as YYYY-MM-DD (the entry_date key Goals uses). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Dashboard Goals panel — the whole Goals experience, inline. Aggregates every
 * goal area the viewer can see (across spaces/terminals; RLS scopes it), shows
 * the week's progress against each target, and logs a value for today directly
 * — no separate detail page. Mirrors the inline-everything pattern of the
 * Pipeline and Contacts cards.
 */
export function GoalsCard() {
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const today = todayIso();
    const start = startOfWeek(today);
    const end = endOfWeek(today);
    const categories = await loadAllVisibleCategories(supabase);
    const goals = await loadGoalsForCategories(
      supabase,
      categories.map((c) => c.id),
    );
    const goalIds = goals.map((g) => g.id);
    const [targets, weekSums] = await Promise.all([
      loadCurrentTargets(supabase, goalIds, today),
      sumWeekValues(supabase, goalIds, start, end),
    ]);
    setData({
      categories,
      goals,
      targetsByGoal: Object.fromEntries(targets),
      weekTotalsByGoal: Object.fromEntries(weekSums),
      weekLabel: formatWeekLabel(start, end),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    load().catch(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const onLogValue = useCallback(
    async (goalId: string, value: number) => {
      const supabase = createClient();
      await recordEntry(supabase, {
        goal_id: goalId,
        entry_date: todayIso(),
        value,
      });
      await load(); // refresh the week totals
    },
    [load],
  );

  return (
    <DashboardCard title="Goals" count={data?.categories.length} expandHref={null}>
      {loading ? (
        <p className="px-3 py-4 text-center text-xs text-text-3">Loading…</p>
      ) : !data || data.categories.length === 0 ? (
        <Empty />
      ) : (
        <GoalsView
          categories={data.categories}
          goals={data.goals}
          targetsByGoal={data.targetsByGoal}
          weekTotalsByGoal={data.weekTotalsByGoal}
          weekLabel={data.weekLabel}
          onLogValue={onLogValue}
        />
      )}
    </DashboardCard>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
      <Target className="h-5 w-5 text-text-3" aria-hidden="true" />
      <p className="text-xs text-text-2">No goals yet.</p>
      <p className="text-xs text-text-3">
        Set weekly numeric targets and log daily progress. Add goal areas from a
        space or terminal&apos;s Goals settings.
      </p>
    </div>
  );
}
