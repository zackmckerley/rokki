"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Plus, Pencil, Archive, Check, X, Loader2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  GoalsCategoryRow,
  GoalsGoalRow,
  GoalsEntryRow,
  GoalPeriod,
  TargetPeriod,
} from "@/lib/modules/goals-queries";
import { moveBefore } from "@/lib/modules/goals-queries";

type DragHandleProps = {
  draggable: true;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
};
import {
  periodWindow,
  eachDayOfWeek,
  startOfWeek,
  type GoalPeriodKind,
} from "@/lib/modules/goals-week";

// Week starts Sunday → labels run Sun … Sat.
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const PERIODS: { v: GoalPeriod; label: string }[] = [
  { v: "daily", label: "Daily" },
  { v: "weekly", label: "Weekly" },
  { v: "monthly", label: "Monthly" },
];
const TARGET_PERIODS: { v: TargetPeriod; label: string; short: string }[] = [
  { v: "day", label: "day", short: "day" },
  { v: "week", label: "week", short: "wk" },
  { v: "month", label: "month", short: "mo" },
];
const TARGET_TO_KIND: Record<TargetPeriod, GoalPeriodKind> = {
  day: "daily",
  week: "weekly",
  month: "monthly",
};
const TARGET_SHORT: Record<TargetPeriod, string> = { day: "day", week: "wk", month: "mo" };
const SWATCHES = ["#64748B", "#3B82F6", "#22C55E", "#EAB308", "#A855F7", "#14B8A6", "#EF4444"];

export interface NewGoal {
  name: string;
  unit: string;
  period: GoalPeriod;
  target_period: TargetPeriod;
  target: number;
}

interface Props {
  categories: GoalsCategoryRow[];
  goals: GoalsGoalRow[];
  targetsByGoal: Record<string, number>;
  entriesByGoal: Record<string, GoalsEntryRow[]>;
  /** Today, YYYY-MM-DD. */
  today: string;
  onLog: (goalId: string, entryDate: string, value: number) => Promise<void>;
  onAddGoal: (categoryId: string, input: NewGoal) => Promise<void>;
  onUpdateGoal: (
    goalId: string,
    patch: {
      name?: string;
      unit?: string;
      period?: GoalPeriod;
      target_period?: TargetPeriod;
      target?: number;
    },
  ) => Promise<void>;
  onArchiveGoal: (goalId: string) => Promise<void>;
  onUpdateCategory: (categoryId: string, patch: { name?: string; color?: string }) => Promise<void>;
  onArchiveCategory: (categoryId: string) => Promise<void>;
  onReorderGoals: (categoryId: string, orderedGoalIds: string[]) => Promise<void>;
  onReorderAreas: (orderedCategoryIds: string[]) => Promise<void>;
}

function valueOn(entries: GoalsEntryRow[], date: string): number {
  const e = entries.find((x) => x.entry_date === date);
  return e ? Number(e.value) : 0;
}
function sumInWindow(entries: GoalsEntryRow[], start: string, end: string): number {
  return entries
    .filter((e) => e.entry_date >= start && e.entry_date <= end)
    .reduce((s, e) => s + Number(e.value), 0);
}

export function GoalsTrack(props: Props) {
  const [dragArea, setDragArea] = useState<string | null>(null);
  const [overArea, setOverArea] = useState<string | null>(null);
  const catIds = props.categories.map((c) => c.id);

  return (
    <div className="flex flex-col">
      {props.categories.map((c) => (
        <div
          key={c.id}
          onDragOver={(e) => {
            if (dragArea && dragArea !== c.id) {
              e.preventDefault();
              if (overArea !== c.id) setOverArea(c.id);
            }
          }}
          onDrop={(e) => {
            if (!dragArea) return;
            e.preventDefault();
            const next = moveBefore(catIds, dragArea, c.id);
            setDragArea(null);
            setOverArea(null);
            if (next !== catIds) void props.onReorderAreas(next);
          }}
          className={cn(
            "border-t-2 border-transparent",
            overArea === c.id && dragArea !== c.id ? "border-accent" : "",
          )}
        >
          <Area
            category={c}
            dragging={dragArea === c.id}
            dragHandle={{
              draggable: true,
              onDragStart: (e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragArea(c.id);
              },
              onDragEnd: () => {
                setDragArea(null);
                setOverArea(null);
              },
            }}
            {...props}
          />
        </div>
      ))}
    </div>
  );
}

function Area({
  category,
  dragging,
  dragHandle,
  ...rest
}: {
  category: GoalsCategoryRow;
  dragging: boolean;
  dragHandle: DragHandleProps;
} & Props) {
  const goals = rest.goals.filter((g) => g.category_id === category.id);
  const goalIds = goals.map((g) => g.id);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dragGoal, setDragGoal] = useState<string | null>(null);
  const [overGoal, setOverGoal] = useState<string | null>(null);

  return (
    <div
      className={cn(
        "border-t border-border/40 px-3 py-3 first:border-t-0",
        dragging && "opacity-50",
      )}
    >
      {editing ? (
        <AreaEditForm
          category={category}
          onCancel={() => setEditing(false)}
          onSave={async (patch) => {
            await rest.onUpdateCategory(category.id, patch);
            setEditing(false);
          }}
          onArchive={async () => {
            await rest.onArchiveCategory(category.id);
            setEditing(false);
          }}
        />
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Drag to reorder area"
            className="cursor-grab rounded-sm p-0.5 text-text-3 hover:text-text-1 active:cursor-grabbing"
            {...dragHandle}
          >
            <GripVertical className="h-3 w-3" />
          </button>
          <span
            aria-hidden="true"
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: category.color }}
          />
          <span className="flex-1 truncate text-xs font-semibold text-text-1">
            {category.name}
          </span>
          <span className="font-mono text-[10px] text-text-3">{goals.length}</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit area"
            className="rounded-sm p-0.5 text-text-3 hover:text-text-1"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2.5">
        {goals.map((g) => (
          <div
            key={g.id}
            onDragOver={(e) => {
              if (dragGoal && dragGoal !== g.id) {
                e.preventDefault();
                if (overGoal !== g.id) setOverGoal(g.id);
              }
            }}
            onDrop={(e) => {
              if (!dragGoal) return;
              e.preventDefault();
              const next = moveBefore(goalIds, dragGoal, g.id);
              setDragGoal(null);
              setOverGoal(null);
              if (next !== goalIds) void rest.onReorderGoals(category.id, next);
            }}
            className={cn(
              "-mt-[2px] border-t-2 border-transparent pt-[2px]",
              overGoal === g.id && dragGoal !== g.id ? "border-accent" : "",
              dragGoal === g.id ? "opacity-50" : "",
            )}
          >
            <GoalRow
              goal={g}
              dragHandle={{
                draggable: true,
                onDragStart: (e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDragGoal(g.id);
                },
                onDragEnd: () => {
                  setDragGoal(null);
                  setOverGoal(null);
                },
              }}
              {...rest}
            />
          </div>
        ))}
      </div>

      {adding ? (
        <div className="mt-3">
          <GoalEditForm
            submitLabel="Add"
            onCancel={() => setAdding(false)}
            onSave={async (vals) => {
              await rest.onAddGoal(category.id, vals);
              setAdding(false);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 flex items-center gap-1 text-2xs text-text-3 hover:text-text-1"
        >
          <Plus className="h-3 w-3" /> Add goal
        </button>
      )}
    </div>
  );
}

function GoalRow({
  goal,
  dragHandle,
  today,
  targetsByGoal,
  entriesByGoal,
  onLog,
  onUpdateGoal,
  onArchiveGoal,
}: { goal: GoalsGoalRow; dragHandle: DragHandleProps } & Props) {
  const [editing, setEditing] = useState(false);
  const target = targetsByGoal[goal.id] ?? 0;
  const entries = entriesByGoal[goal.id] ?? [];

  // The target is measured over its own window (day/week/month), independent of
  // the record cadence.
  const targetWin = periodWindow(TARGET_TO_KIND[goal.target_period], today);
  const total = sumInWindow(entries, targetWin.start, targetWin.end);
  const pct = target > 0 ? Math.min((total / target) * 100, 100) : 0;

  // The logging cells follow the record cadence. Daily → the current Sun–Sat
  // week; weekly/monthly → a single bucket keyed on its start date.
  const weekStart = startOfWeek(today);
  const cadenceStart = periodWindow(goal.period, today).start;

  if (editing) {
    return (
      <GoalEditForm
        submitLabel="Save"
        initial={{
          name: goal.name,
          unit: goal.unit,
          period: goal.period,
          target_period: goal.target_period,
          target,
        }}
        onCancel={() => setEditing(false)}
        onArchive={async () => {
          await onArchiveGoal(goal.id);
          setEditing(false);
        }}
        onSave={async (vals) => {
          await onUpdateGoal(goal.id, vals);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="text-xs">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Drag to reorder goal"
          className="cursor-grab rounded-sm p-0.5 text-text-3 hover:text-text-1 active:cursor-grabbing"
          {...dragHandle}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <span className="min-w-0 flex-1 truncate text-text-0">{goal.name}</span>
        <span className="font-mono text-[10px] text-text-3">
          <b className="text-text-1">{total}</b> / {target} {goal.unit} ·{" "}
          {TARGET_SHORT[goal.target_period]}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit goal"
          className="rounded-sm p-0.5 text-text-3 hover:text-text-1"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>

      {goal.period === "daily" ? (
        <div className="mt-1.5 flex items-center gap-1">
          {eachDayOfWeek(weekStart).map((d, i) => (
            <LogCell
              key={d}
              label={DAY_LETTERS[i]}
              value={valueOn(entries, d)}
              isToday={d === today}
              onCommit={(v) => onLog(goal.id, d, v)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-2">
          <LogCell
            wide
            label={goal.period === "monthly" ? "this month" : "this week"}
            value={valueOn(entries, cadenceStart)}
            isToday
            onCommit={(v) => onLog(goal.id, cadenceStart, v)}
          />
        </div>
      )}

      <div className="mt-2 h-1 w-full rounded-sm bg-bg-3">
        <div
          className={cn("h-full rounded-sm", pct >= 100 ? "bg-success" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** A single editable value cell — commits on Enter/blur when changed. */
function LogCell({
  label,
  value,
  isToday,
  wide,
  onCommit,
}: {
  label: string;
  value: number;
  isToday: boolean;
  wide?: boolean;
  onCommit: (value: number) => Promise<void>;
}) {
  const [v, setV] = useState(value === 0 ? "" : String(value));
  const [busy, setBusy] = useState(false);
  const editing = useRef(false);

  // Re-sync to the authoritative value when it changes externally (a reload
  // after a failed/normalized write), but never clobber what the user is
  // actively typing.
  useEffect(() => {
    if (!editing.current) setV(value === 0 ? "" : String(value));
  }, [value]);

  async function commit() {
    const n = v.trim() === "" ? 0 : Number(v);
    if (!Number.isFinite(n) || n === value) {
      setV(value === 0 ? "" : String(value));
      return;
    }
    setBusy(true);
    try {
      await onCommit(n);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={cn("flex flex-col items-center gap-0.5", wide ? "items-start" : "flex-1")}>
      <span className={cn("text-[9px]", isToday ? "text-accent" : "text-text-3")}>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={v}
        disabled={busy}
        onChange={(e) => setV(e.target.value)}
        onFocus={() => {
          editing.current = true;
        }}
        onBlur={() => {
          editing.current = false;
          void commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="–"
        aria-label={`Value for ${label}`}
        className={cn(
          "h-6 rounded-sm border bg-bg-2 px-1 text-center text-[11px] text-text-0 outline-none placeholder:text-text-3 focus:border-border-focus disabled:opacity-50",
          wide ? "w-20 text-left px-2" : "w-full",
          isToday ? "border-border-focus" : "border-border",
        )}
      />
    </span>
  );
}

function GoalEditForm({
  initial,
  submitLabel,
  onSave,
  onCancel,
  onArchive,
}: {
  initial?: NewGoal;
  submitLabel: string;
  onSave: (vals: NewGoal) => Promise<void>;
  onCancel: () => void;
  onArchive?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [period, setPeriod] = useState<GoalPeriod>(initial?.period ?? "daily");
  const [targetPeriod, setTargetPeriod] = useState<TargetPeriod>(
    initial?.target_period ?? "week",
  );
  const [target, setTarget] = useState(initial?.target ? String(initial.target) : "");
  const [busy, setBusy] = useState(false);

  const canSave =
    name.trim() && unit.trim() && Number.isFinite(Number(target)) && target.trim() !== "";

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        unit: unit.trim(),
        period,
        target_period: targetPeriod,
        target: Number(target),
      });
    } finally {
      setBusy(false);
    }
  }

  const inp =
    "rounded-sm border border-border bg-bg-2 px-2 py-1 text-[11px] text-text-0 placeholder:text-text-3 outline-none focus:border-border-focus";
  const lbl = "flex items-center gap-1.5 text-[10px] text-text-3";
  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-border/60 bg-bg-1 p-2.5">
      {/* Unit on the far left, then the goal name. */}
      <div className="flex items-center gap-2">
        <input
          className={`${inp} w-24 flex-shrink-0`}
          placeholder="unit (e.g. reps)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <input
          autoFocus
          className={`${inp} min-w-0 flex-1`}
          placeholder="Goal name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className={lbl}>
          Record
          <select
            aria-label="Record cadence"
            className={inp}
            value={period}
            onChange={(e) => setPeriod(e.target.value as GoalPeriod)}
          >
            {PERIODS.map((p) => (
              <option key={p.v} value={p.v}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={lbl}>
          Target per
          <select
            aria-label="Target period"
            className={inp}
            value={targetPeriod}
            onChange={(e) => setTargetPeriod(e.target.value as TargetPeriod)}
          >
            {TARGET_PERIODS.map((p) => (
              <option key={p.v} value={p.v}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={lbl}>
          Target
          <input
            type="number"
            inputMode="numeric"
            className={`${inp} w-16 text-right`}
            placeholder="0"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        {onArchive && (
          <button
            type="button"
            onClick={() => void onArchive()}
            aria-label="Archive goal"
            className="mr-auto rounded-sm p-1 text-text-3 hover:text-danger"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="rounded-sm p-1 text-text-3 hover:text-text-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave || busy}
          className="flex items-center gap-1 rounded-sm border border-border bg-accent/15 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function AreaEditForm({
  category,
  onSave,
  onCancel,
  onArchive,
}: {
  category: GoalsCategoryRow;
  onSave: (patch: { name?: string; color?: string }) => Promise<void>;
  onCancel: () => void;
  onArchive: () => Promise<void>;
}) {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave({ name: name.trim(), color });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        className="min-w-0 flex-1 rounded-sm border border-border bg-bg-2 px-2 py-1 text-[11px] text-text-0 outline-none focus:border-border-focus"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex items-center gap-1">
        {SWATCHES.map((sw) => (
          <button
            key={sw}
            type="button"
            aria-label={`Color ${sw}`}
            aria-pressed={color === sw}
            onClick={() => setColor(sw)}
            className={cn(
              "h-3.5 w-3.5 rounded-full",
              color === sw ? "ring-2 ring-border-focus ring-offset-1 ring-offset-bg-1" : "",
            )}
            style={{ background: sw }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => void onArchive()}
        aria-label="Archive area"
        className="rounded-sm p-1 text-text-3 hover:text-danger"
      >
        <Archive className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="rounded-sm p-1 text-text-3 hover:text-text-1"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void save()}
        disabled={!name.trim() || busy}
        className="rounded-sm border border-border bg-accent/15 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </button>
    </div>
  );
}
