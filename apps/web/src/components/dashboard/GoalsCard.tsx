"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Target } from "lucide-react";
import { DashboardCard } from "./DashboardCard";
import { GoalsView, type NewGoalInput } from "@/components/modules/GoalsView";
import { createClient } from "@/lib/supabase/client";
import {
  loadAllVisibleCategories,
  loadGoalsForCategories,
  loadCurrentTargets,
  sumWeekValues,
  addEntryValue,
  createCategory,
  createGoal,
  setWeeklyTarget,
  type GoalsCategoryRow,
  type GoalsGoalRow,
} from "@/lib/modules/goals-queries";
import { startOfWeek, endOfWeek, formatWeekLabel } from "@/lib/modules/goals-week";

interface SpaceLite {
  id: string;
  name: string;
}

interface Loaded {
  categories: GoalsCategoryRow[];
  goals: GoalsGoalRow[];
  targetsByGoal: Record<string, number>;
  weekTotalsByGoal: Record<string, number>;
  weekLabel: string;
  spaces: SpaceLite[];
}

/** A small palette for new goal areas (the color CHECK wants #RRGGBB). */
const SWATCHES = ["#3B82F6", "#22C55E", "#EF4444", "#EAB308", "#A855F7", "#14B8A6"];

/** Today as YYYY-MM-DD (the entry_date key Goals uses). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Dashboard Goals panel — the whole Goals experience, inline. Aggregates every
 * goal area the viewer can see (across spaces/terminals; RLS scopes it), shows
 * the week's progress against each target, logs progress for today, and lets
 * you create goal areas + goals right here — no separate detail page. Mirrors
 * the inline-everything pattern of the Pipeline and Contacts cards.
 */
export function GoalsCard() {
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const today = todayIso();
    const start = startOfWeek(today);
    const end = endOfWeek(today);
    const [categories, spacesRes] = await Promise.all([
      loadAllVisibleCategories(supabase),
      supabase.from("spaces").select("id, name").is("archived_at", null).order("name"),
    ]);
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
      spaces: (spacesRes.data as SpaceLite[] | null) ?? [],
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

  // Logging ADDS to today's running total (the "+N" affordance). The add is
  // atomic in the goals_add_entry RPC, so two quick logs accumulate instead of
  // clobbering each other; the total is clamped at 0 server-side.
  const onLogValue = useCallback(
    async (goalId: string, n: number) => {
      if (!Number.isFinite(n)) return;
      await addEntryValue(createClient(), goalId, todayIso(), n);
      await load();
    },
    [load],
  );

  const onAddGoal = useCallback(
    async (categoryId: string, input: NewGoalInput) => {
      const supabase = createClient();
      const goal = await createGoal(supabase, {
        category_id: categoryId,
        name: input.name,
        unit: input.unit,
      });
      await setWeeklyTarget(supabase, {
        goal_id: goal.id,
        weekly_target: input.target,
        valid_from: startOfWeek(todayIso()),
      });
      await load();
    },
    [load],
  );

  const onAddCategory = useCallback(
    async (name: string, color: string, spaceId: string) => {
      const supabase = createClient();
      await createCategory(supabase, { kind: "space", spaceId }, { name, color });
      await load();
    },
    [load],
  );

  return (
    <DashboardCard title="Goals" count={data?.categories.length} expandHref={null}>
      {loading ? (
        <p className="px-3 py-4 text-center text-xs text-text-3">Loading…</p>
      ) : !data ? (
        <Empty />
      ) : (
        <div className="flex flex-col">
          {data.categories.length === 0 ? (
            <Empty />
          ) : (
            <GoalsView
              categories={data.categories}
              goals={data.goals}
              targetsByGoal={data.targetsByGoal}
              weekTotalsByGoal={data.weekTotalsByGoal}
              weekLabel={data.weekLabel}
              onLogValue={onLogValue}
              onAddGoal={onAddGoal}
            />
          )}
          <div className="border-t border-border/40 px-3 py-2">
            <NewAreaForm spaces={data.spaces} onAdd={onAddCategory} />
          </div>
        </div>
      )}
    </DashboardCard>
  );
}

/** Inline "new goal area" (category) form — name, color, and which space. */
function NewAreaForm({
  spaces,
  onAdd,
}: {
  spaces: SpaceLite[];
  onAdd: (name: string, color: string, spaceId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [spaceId, setSpaceId] = useState("");
  const [busy, setBusy] = useState(false);

  // Default the space once it's known.
  useEffect(() => {
    if (!spaceId && spaces.length > 0) setSpaceId(spaces[0].id);
  }, [spaces, spaceId]);

  function reset() {
    setName("");
    setColor(SWATCHES[0]);
    setOpen(false);
  }

  async function submit() {
    if (!name.trim() || !spaceId) return;
    setBusy(true);
    try {
      await onAdd(name.trim(), color, spaceId);
      reset();
    } finally {
      setBusy(false);
    }
  }

  if (spaces.length === 0) {
    return (
      <p className="text-[11px] text-text-3">
        Join or create a space to add goal areas.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-2xs text-text-3 hover:text-text-1"
      >
        <Plus className="h-3 w-3" aria-hidden="true" /> New goal area
      </button>
    );
  }

  const inp =
    "rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 text-[11px] text-text-0 placeholder:text-text-3 outline-none focus:border-border-focus";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          className={`${inp} min-w-0 flex-1`}
          placeholder="Area name (e.g. Health)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
        {spaces.length > 1 && (
          <select
            aria-label="Space"
            value={spaceId}
            onChange={(e) => setSpaceId(e.target.value)}
            className={inp}
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1">
          {SWATCHES.map((sw) => (
            <button
              key={sw}
              type="button"
              aria-label={`Color ${sw}`}
              aria-pressed={color === sw}
              onClick={() => setColor(sw)}
              className={`h-4 w-4 rounded-full ${color === sw ? "ring-2 ring-offset-1 ring-offset-bg-1 ring-border-focus" : ""}`}
              style={{ background: sw }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !name.trim() || !spaceId}
          className="ml-auto rounded-sm border border-border bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-sm px-1 py-0.5 text-[11px] text-text-3 hover:text-text-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
      <Target className="h-5 w-5 text-text-3" aria-hidden="true" />
      <p className="text-xs text-text-2">No goals yet.</p>
      <p className="text-xs text-text-3">
        Create a goal area below, add goals with weekly targets, then log daily
        progress.
      </p>
    </div>
  );
}
