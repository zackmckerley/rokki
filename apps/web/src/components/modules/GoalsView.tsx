"use client";

import { useState } from "react";
import { Plus, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import type {
  GoalsCategoryRow,
  GoalsGoalRow,
} from "@/lib/modules/goals-queries";

interface GoalsViewProps {
  scope:
    | { kind: "user"; label: string }
    | { kind: "space"; spaceId: string; label: string }
    | { kind: "terminal"; terminalId: string; label: string };
  categories: GoalsCategoryRow[];
  goals: GoalsGoalRow[];
  targetsByGoal: Record<string, number>;
  weekTotalsByGoal: Record<string, number>;
  /**
   * Window the weekly totals were computed over — purely for display
   * (the week label, "Week of …"). Inclusive on both ends.
   */
  weekRange: { start: string; end: string };
  /**
   * Optional callback wired by the parent server action to record a
   * day entry. When omitted (e.g. user-aggregated view across spaces)
   * the inputs render disabled.
   */
  onLogValue?: (goalId: string, value: number) => Promise<void>;
}

/**
 * Read-mostly Goals view at a given scope. Renders categories with
 * their goals + the current week's progress bar against target.
 *
 * Mirrors the visual structure of the standalone rokki-goals app's
 * weekly screen so the port feels familiar to existing users.
 */
export function GoalsView({
  scope,
  categories,
  goals,
  targetsByGoal,
  weekTotalsByGoal,
  weekRange,
  onLogValue,
}: GoalsViewProps) {
  const goalsByCategory = new Map<string, GoalsGoalRow[]>();
  for (const g of goals) {
    const list = goalsByCategory.get(g.category_id) ?? [];
    list.push(g);
    goalsByCategory.set(g.category_id, list);
  }

  return (
    <div className="space-y-3 p-2 sm:p-3">
      {categories.length === 0 ? (
        <DashboardCard
          title={`Goals · ${scope.label}`}
          count={0}
          expandHref={null}
        >
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <Target className="h-5 w-5 text-text-3" aria-hidden="true" />
            <p className="text-xs text-text-2">
              No goal categories at this scope yet.
            </p>
            <p className="text-[11px] text-text-3">
              Set up categories from the module settings.
            </p>
          </div>
        </DashboardCard>
      ) : (
        categories.map((c) => (
          <DashboardCard
            key={c.id}
            title={c.name}
            count={(goalsByCategory.get(c.id) ?? []).length}
            expandHref={null}
            headerRight={
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ background: c.color }}
              />
            }
          >
            <p className="px-3 pt-1 text-[10px] uppercase tracking-wide text-text-3">
              Week of {weekRange.start}
            </p>
            <ul className="divide-y divide-border/40">
              {(goalsByCategory.get(c.id) ?? []).map((g) => {
                const target = targetsByGoal[g.id] ?? 0;
                const week = weekTotalsByGoal[g.id] ?? 0;
                const pct = target > 0 ? Math.min((week / target) * 100, 999) : 0;
                return (
                  <li key={g.id} className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate text-text-0">
                        {g.name}
                      </span>
                      <span className="font-mono text-[10px] text-text-3">
                        <b className="text-text-1">{week}</b>{" / "}
                        {target} {g.unit}
                      </span>
                      <LogValueInput
                        goalId={g.id}
                        onLogValue={onLogValue}
                      />
                    </div>
                    <div
                      className="mt-1.5 h-1 w-full rounded-sm bg-bg-3"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(pct, 100)}
                    >
                      <div
                        className={cn(
                          "h-full rounded-sm",
                          pct >= 100 ? "bg-success" : "bg-accent",
                        )}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </DashboardCard>
        ))
      )}
    </div>
  );
}

function LogValueInput({
  goalId,
  onLogValue,
}: {
  goalId: string;
  onLogValue?: (goalId: string, value: number) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!onLogValue) return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    setBusy(true);
    try {
      await onLogValue(goalId, n);
      setValue("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="+"
        disabled={!onLogValue || busy}
        aria-label="Log a value for this goal"
        className="w-12 rounded-sm border border-border bg-bg-2 px-1 py-0.5 text-right text-[11px] text-text-0 outline-none placeholder:text-text-3 focus:border-border-focus disabled:cursor-not-allowed disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!onLogValue || busy || value.trim() === ""}
        aria-label="Save value"
        className="rounded-sm border border-border bg-bg-2 p-0.5 text-text-2 hover:bg-bg-3 hover:text-text-0 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}
