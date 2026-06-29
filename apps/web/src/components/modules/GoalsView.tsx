"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  GoalsCategoryRow,
  GoalsGoalRow,
} from "@/lib/modules/goals-queries";

/** A new goal a user is adding to a category. */
export interface NewGoalInput {
  name: string;
  unit: string;
  target: number;
}

interface GoalsViewProps {
  categories: GoalsCategoryRow[];
  goals: GoalsGoalRow[];
  targetsByGoal: Record<string, number>;
  weekTotalsByGoal: Record<string, number>;
  /** "Mon Aug 12 → Sun Aug 18" style label for the active week. */
  weekLabel: string;
  /**
   * Records a value for today against a goal. When omitted the inputs render
   * disabled (read-only view).
   */
  onLogValue?: (goalId: string, value: number) => Promise<void>;
  /** Adds a goal (+ its weekly target) under a category. When omitted, the
   *  per-category "add goal" affordance is hidden. */
  onAddGoal?: (categoryId: string, input: NewGoalInput) => Promise<void>;
}

/**
 * Goals progress, grouped by category — a flat list of sections so it sits
 * inside a single dashboard panel (the dashboard Goals card is the only host).
 * Each goal shows the week's running total against its weekly target plus an
 * inline "log a value for today" input.
 */
export function GoalsView({
  categories,
  goals,
  targetsByGoal,
  weekTotalsByGoal,
  weekLabel,
  onLogValue,
  onAddGoal,
}: GoalsViewProps) {
  const goalsByCategory = new Map<string, GoalsGoalRow[]>();
  for (const g of goals) {
    const list = goalsByCategory.get(g.category_id) ?? [];
    list.push(g);
    goalsByCategory.set(g.category_id, list);
  }

  return (
    <div className="flex flex-col">
      <p className="px-3 pt-2 text-[10px] uppercase tracking-wide text-text-3">
        Week of {weekLabel}
      </p>
      {categories.map((c) => {
        const list = goalsByCategory.get(c.id) ?? [];
        return (
          <div key={c.id} className="border-t border-border/40 first:border-t-0">
            <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: c.color }}
              />
              <span className="flex-1 truncate text-xs font-semibold text-text-1">
                {c.name}
              </span>
              <span className="font-mono text-[10px] text-text-3">{list.length}</span>
            </div>
            <ul className="divide-y divide-border/30">
              {list.length === 0 ? (
                <li className="px-3 py-2 text-2xs text-text-3">
                  No goals in this area yet.
                </li>
              ) : (
                list.map((g) => {
                  const target = targetsByGoal[g.id] ?? 0;
                  const week = weekTotalsByGoal[g.id] ?? 0;
                  const pct = target > 0 ? Math.min((week / target) * 100, 999) : 0;
                  return (
                    <li key={g.id} className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 truncate text-text-0">{g.name}</span>
                        <span className="font-mono text-[10px] text-text-3">
                          <b className="text-text-1">{week}</b>
                          {" / "}
                          {target} {g.unit}
                        </span>
                        <LogValueInput goalId={g.id} onLogValue={onLogValue} />
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
                })
              )}
              {onAddGoal && (
                <li className="px-3 py-1.5">
                  <AddGoalRow
                    onAdd={(input) => onAddGoal(c.id, input)}
                  />
                </li>
              )}
            </ul>
          </div>
        );
      })}
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
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        placeholder="+"
        disabled={!onLogValue || busy}
        aria-label="Log a value for today"
        className="w-12 rounded-sm border border-border bg-bg-2 px-1 py-0.5 text-right text-[11px] text-text-0 outline-none placeholder:text-text-3 focus:border-border-focus disabled:cursor-not-allowed disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!onLogValue || busy || value.trim() === ""}
        aria-label="Add to today's total"
        className="rounded-sm border border-border bg-bg-2 p-0.5 text-text-2 hover:bg-bg-3 hover:text-text-0 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}

/** Inline "add a goal to this area" form — name, unit, weekly target. */
function AddGoalRow({ onAdd }: { onAdd: (input: NewGoalInput) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setUnit("");
    setTarget("");
    setOpen(false);
  }

  async function submit() {
    const t = Number(target);
    if (!name.trim() || !unit.trim() || !Number.isFinite(t)) return;
    setBusy(true);
    try {
      await onAdd({ name: name.trim(), unit: unit.trim(), target: t });
      reset();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-2xs text-text-3 hover:text-text-1"
      >
        <Plus className="h-3 w-3" aria-hidden="true" /> Add goal
      </button>
    );
  }

  const inp =
    "rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 text-[11px] text-text-0 placeholder:text-text-3 outline-none focus:border-border-focus";
  return (
    <div className="flex flex-wrap items-center gap-1">
      <input
        autoFocus
        className={`${inp} min-w-0 flex-1`}
        placeholder="Goal name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className={`${inp} w-14`}
        placeholder="unit"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
      />
      <input
        type="number"
        inputMode="numeric"
        className={`${inp} w-16 text-right`}
        placeholder="target/wk"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !name.trim() || !unit.trim() || target.trim() === ""}
        className="rounded-sm border border-border bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
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
  );
}
