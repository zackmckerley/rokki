"use client";

import { useState } from "react";
import { Plus, Pencil, Archive, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  GoalsCategoryRow,
  GoalsGoalRow,
  GoalsEntryRow,
  GoalPeriod,
} from "@/lib/modules/goals-queries";
import { periodWindow, eachDayOfWeek } from "@/lib/modules/goals-week";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const PERIODS: { v: GoalPeriod; label: string; per: string }[] = [
  { v: "daily", label: "Daily", per: "wk" },
  { v: "weekly", label: "Weekly", per: "wk" },
  { v: "monthly", label: "Monthly", per: "mo" },
];
const SWATCHES = ["#64748B", "#3B82F6", "#22C55E", "#EAB308", "#A855F7", "#14B8A6", "#EF4444"];

export interface NewGoal {
  name: string;
  unit: string;
  period: GoalPeriod;
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
    patch: { name?: string; unit?: string; period?: GoalPeriod; target?: number },
  ) => Promise<void>;
  onArchiveGoal: (goalId: string) => Promise<void>;
  onUpdateCategory: (categoryId: string, patch: { name?: string; color?: string }) => Promise<void>;
  onArchiveCategory: (categoryId: string) => Promise<void>;
}

function valueOn(entries: GoalsEntryRow[], date: string): number {
  const e = entries.find((x) => x.entry_date === date);
  return e ? Number(e.value) : 0;
}
const unitOf = (g: GoalsGoalRow) => (g.period === "monthly" ? "mo" : "wk");

export function GoalsTrack(props: Props) {
  return (
    <div className="flex flex-col">
      {props.categories.map((c) => (
        <Area key={c.id} category={c} {...props} />
      ))}
    </div>
  );
}

function Area({ category, ...rest }: { category: GoalsCategoryRow } & Props) {
  const goals = rest.goals.filter((g) => g.category_id === category.id);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <div className="border-t border-border/40 px-3 py-2.5 first:border-t-0">
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
        <div className="flex items-center gap-2">
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

      <div className="mt-1.5 flex flex-col gap-2">
        {goals.map((g) => (
          <GoalRow key={g.id} goal={g} {...rest} />
        ))}
      </div>

      {adding ? (
        <GoalEditForm
          submitLabel="Add"
          onCancel={() => setAdding(false)}
          onSave={async (vals) => {
            await rest.onAddGoal(category.id, vals);
            setAdding(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center gap-1 text-2xs text-text-3 hover:text-text-1"
        >
          <Plus className="h-3 w-3" /> Add goal
        </button>
      )}
    </div>
  );
}

function GoalRow({
  goal,
  today,
  targetsByGoal,
  entriesByGoal,
  onLog,
  onUpdateGoal,
  onArchiveGoal,
}: { goal: GoalsGoalRow } & Props) {
  const [editing, setEditing] = useState(false);
  const target = targetsByGoal[goal.id] ?? 0;
  const entries = entriesByGoal[goal.id] ?? [];
  const win = periodWindow(goal.period, today);

  const total =
    goal.period === "daily"
      ? eachDayOfWeek(win.start).reduce((s, d) => s + valueOn(entries, d), 0)
      : valueOn(entries, win.start);
  const pct = target > 0 ? Math.min((total / target) * 100, 100) : 0;

  if (editing) {
    return (
      <GoalEditForm
        submitLabel="Save"
        initial={{ name: goal.name, unit: goal.unit, period: goal.period, target }}
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
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-text-0">
          {goal.name}
          <span className="ml-1 text-[10px] text-text-3">· {goal.unit}</span>
        </span>
        <span className="font-mono text-[10px] text-text-3">
          <b className="text-text-1">{total}</b> / {target} / {unitOf(goal)}
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
        <div className="mt-1 flex items-center gap-1">
          {eachDayOfWeek(win.start).map((d, i) => (
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
        <div className="mt-1 flex items-center gap-2">
          <LogCell
            wide
            label={goal.period === "monthly" ? "this month" : "this week"}
            value={valueOn(entries, win.start)}
            isToday
            onCommit={(v) => onLog(goal.id, win.start, v)}
          />
        </div>
      )}

      <div className="mt-1.5 h-1 w-full rounded-sm bg-bg-3">
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
        onBlur={commit}
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
  const [target, setTarget] = useState(initial?.target ? String(initial.target) : "");
  const [busy, setBusy] = useState(false);

  const per = PERIODS.find((p) => p.v === period)?.per ?? "wk";
  const canSave = name.trim() && unit.trim() && Number.isFinite(Number(target)) && target.trim() !== "";

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      await onSave({ name: name.trim(), unit: unit.trim(), period, target: Number(target) });
    } finally {
      setBusy(false);
    }
  }

  const inp =
    "rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 text-[11px] text-text-0 placeholder:text-text-3 outline-none focus:border-border-focus";
  return (
    <div className="flex flex-col gap-1.5 rounded border border-border/60 bg-bg-1 p-2">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          className={`${inp} min-w-0 flex-1`}
          placeholder="Goal name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={`${inp} w-16`}
          placeholder="unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <select
          aria-label="Cadence"
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
        <span className="flex items-center gap-1">
          <span className="text-[10px] text-text-3">target</span>
          <input
            type="number"
            inputMode="numeric"
            className={`${inp} w-16 text-right`}
            placeholder="0"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <span className="text-[10px] text-text-3">/ {per}</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          {onArchive && (
            <button
              type="button"
              onClick={() => void onArchive()}
              aria-label="Archive goal"
              className="rounded-sm p-1 text-text-3 hover:text-danger"
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
            className="flex items-center gap-1 rounded-sm border border-border bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {submitLabel}
          </button>
        </div>
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
        className="min-w-0 flex-1 rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 text-[11px] text-text-0 outline-none focus:border-border-focus"
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
        className="rounded-sm border border-border bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </button>
    </div>
  );
}
