"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Target, RotateCcw } from "lucide-react";
import { DashboardCard } from "./DashboardCard";
import { GoalsTrack, type NewGoal } from "@/components/modules/GoalsTrack";
import { createClient } from "@/lib/supabase/client";
import {
  loadAllVisibleCategories,
  loadGoalsForCategories,
  loadCurrentTargets,
  loadEntries,
  recordEntry,
  createCategory,
  createGoal,
  updateGoal,
  updateCategory,
  setWeeklyTarget,
  setGoalArchived,
  setCategoryArchived,
  reorderGoals,
  reorderCategories,
  loadArchivedCategories,
  loadArchivedGoals,
  type GoalsCategoryRow,
  type GoalsGoalRow,
  type GoalsEntryRow,
  type GoalPeriod,
  type TargetPeriod,
} from "@/lib/modules/goals-queries";
import { startOfWeek, periodWindow } from "@/lib/modules/goals-week";

interface SpaceLite {
  id: string;
  name: string;
}
interface Loaded {
  categories: GoalsCategoryRow[];
  goals: GoalsGoalRow[];
  targetsByGoal: Record<string, number>;
  entriesByGoal: Record<string, GoalsEntryRow[]>;
  spaces: SpaceLite[];
}
type Tab = "track" | "history" | "archived";
const TABS: { v: Tab; label: string }[] = [
  { v: "track", label: "This week" },
  { v: "history", label: "History" },
  { v: "archived", label: "Archived" },
];
const SWATCHES = ["#3B82F6", "#22C55E", "#EF4444", "#EAB308", "#A855F7", "#14B8A6"];

function todayIso(): string {
  // LOCAL calendar date, not UTC. toISOString() would roll to tomorrow in the
  // evening for negative-UTC users (e.g. UTC-4), logging entries to the wrong
  // day and advancing the week strip a day early.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function minIso(a: string, b: string) {
  return a < b ? a : b;
}

/**
 * Dashboard Goals panel — the whole Goals experience inline, in tabs:
 *   • This week — log each goal at its own cadence (daily / weekly / monthly),
 *     edit and archive goals + areas, add new ones.
 *   • History — recent buckets per goal as a compact sparkline.
 *   • Archived — restore archived areas / goals.
 * No separate page; expands with the panel when maximized.
 */
export function GoalsCard() {
  const [tab, setTab] = useState<Tab>("track");
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const today = todayIso();
    // One entries pull covering the current week + month AND enough history for
    // the History tab's 8 buckets (8 monthly buckets reach ~7 months back, so
    // fetch ~10 months / 320 days), so every tab reads from the same data.
    const rangeStart = minIso(
      startOfWeek(today),
      new Date(Date.parse(today) - 320 * 86_400_000).toISOString().slice(0, 10),
    );
    const wk = periodWindow("weekly", today);
    const mo = periodWindow("monthly", today);
    const rangeEnd = wk.end > mo.end ? wk.end : mo.end;

    const [categories, spacesRes] = await Promise.all([
      loadAllVisibleCategories(supabase),
      supabase.from("spaces").select("id, name").is("archived_at", null).order("name"),
    ]);
    const goals = await loadGoalsForCategories(
      supabase,
      categories.map((c) => c.id),
    );
    const goalIds = goals.map((g) => g.id);
    const [targets, entries] = await Promise.all([
      loadCurrentTargets(supabase, goalIds, today),
      loadEntries(supabase, goalIds, rangeStart, rangeEnd),
    ]);
    setData({
      categories,
      goals,
      targetsByGoal: Object.fromEntries(targets),
      entriesByGoal: Object.fromEntries(entries),
      spaces: (spacesRes.data as SpaceLite[] | null) ?? [],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    load().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load]);

  // ── mutations ──────────────────────────────────────────────────────
  const onLog = useCallback(
    async (goalId: string, entryDate: string, value: number) => {
      // Optimistic: set the entry locally so the cell + progress bar update
      // instantly, with NO full ~10-month refetch. Reconcile from the server
      // only if the write fails.
      setData((d) => {
        if (!d) return d;
        const list = d.entriesByGoal[goalId] ?? [];
        const idx = list.findIndex((e) => e.entry_date === entryDate);
        const nextList =
          idx >= 0
            ? list.map((e, i) => (i === idx ? { ...e, value } : e))
            : [
                ...list,
                {
                  id: `opt-${goalId}-${entryDate}`,
                  goal_id: goalId,
                  entry_date: entryDate,
                  value,
                  source: "manual",
                  notes: null,
                },
              ];
        return { ...d, entriesByGoal: { ...d.entriesByGoal, [goalId]: nextList } };
      });
      try {
        await recordEntry(createClient(), { goal_id: goalId, entry_date: entryDate, value });
      } catch {
        await load(); // reconcile on failure
      }
    },
    [load],
  );
  const onAddGoal = useCallback(
    async (categoryId: string, input: NewGoal) => {
      const supabase = createClient();
      const goal = await createGoal(supabase, {
        category_id: categoryId,
        name: input.name,
        unit: input.unit,
        period: input.period,
        target_period: input.target_period,
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
  const onUpdateGoal = useCallback(
    async (
      goalId: string,
      patch: {
        name?: string;
        unit?: string;
        period?: GoalPeriod;
        target_period?: TargetPeriod;
        target?: number;
      },
    ) => {
      const supabase = createClient();
      // Optimistic patch of the single goal (+ its target) — no full refetch.
      setData((d) =>
        d
          ? {
              ...d,
              goals: d.goals.map((g) =>
                g.id === goalId
                  ? {
                      ...g,
                      ...(patch.name !== undefined ? { name: patch.name } : {}),
                      ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
                      ...(patch.period !== undefined ? { period: patch.period } : {}),
                      ...(patch.target_period !== undefined
                        ? { target_period: patch.target_period }
                        : {}),
                    }
                  : g,
              ),
              targetsByGoal:
                patch.target !== undefined
                  ? { ...d.targetsByGoal, [goalId]: patch.target }
                  : d.targetsByGoal,
            }
          : d,
      );
      try {
        await updateGoal(supabase, goalId, {
          name: patch.name,
          unit: patch.unit,
          period: patch.period,
          target_period: patch.target_period,
        });
        if (patch.target !== undefined) {
          await setWeeklyTarget(supabase, {
            goal_id: goalId,
            weekly_target: patch.target,
            valid_from: startOfWeek(todayIso()),
          });
        }
      } catch {
        await load();
      }
    },
    [load],
  );
  const onArchiveGoal = useCallback(
    async (goalId: string) => {
      // Optimistic: drop the goal from view immediately.
      setData((d) => (d ? { ...d, goals: d.goals.filter((g) => g.id !== goalId) } : d));
      try {
        await setGoalArchived(createClient(), goalId, true);
      } catch {
        await load();
      }
    },
    [load],
  );
  const onUpdateCategory = useCallback(
    async (categoryId: string, patch: { name?: string; color?: string }) => {
      setData((d) =>
        d
          ? {
              ...d,
              categories: d.categories.map((c) =>
                c.id === categoryId ? { ...c, ...patch } : c,
              ),
            }
          : d,
      );
      try {
        await updateCategory(createClient(), categoryId, patch);
      } catch {
        await load();
      }
    },
    [load],
  );
  const onArchiveCategory = useCallback(
    async (categoryId: string) => {
      // Optimistic: drop the area and its goals from view.
      setData((d) =>
        d
          ? {
              ...d,
              categories: d.categories.filter((c) => c.id !== categoryId),
              goals: d.goals.filter((g) => g.category_id !== categoryId),
            }
          : d,
      );
      try {
        await setCategoryArchived(createClient(), categoryId, true);
      } catch {
        await load();
      }
    },
    [load],
  );
  const onAddCategory = useCallback(
    async (name: string, color: string, spaceId: string) => {
      await createCategory(createClient(), { kind: "space", spaceId }, { name, color });
      await load();
    },
    [load],
  );
  // Drag-reorder: optimistically reorder locally, persist display_order, reload.
  const onReorderAreas = useCallback(
    async (orderedIds: string[]) => {
      setData((d) => {
        if (!d) return d;
        const rank = new Map(orderedIds.map((id, i) => [id, i]));
        // Unranked ids (e.g. one added concurrently) sort to the end, not the
        // front; self-heals on the reload below regardless.
        const at = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
        const categories = [...d.categories].sort((a, b) => at(a.id) - at(b.id));
        return { ...d, categories };
      });
      // Local reorder is authoritative; the write only sets display_order.
      try {
        await reorderCategories(createClient(), orderedIds);
      } catch {
        await load();
      }
    },
    [load],
  );
  const onReorderGoals = useCallback(
    async (categoryId: string, orderedIds: string[]) => {
      setData((d) => {
        if (!d) return d;
        const rank = new Map(orderedIds.map((id, i) => [id, i]));
        const at = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
        const reordered = d.goals
          .filter((g) => g.category_id === categoryId)
          .sort((a, b) => at(a.id) - at(b.id));
        let k = 0;
        // Slot the reordered subset back into the category's original positions.
        const goals = d.goals.map((g) =>
          g.category_id === categoryId ? reordered[k++] : g,
        );
        return { ...d, goals };
      });
      try {
        await reorderGoals(createClient(), orderedIds);
      } catch {
        await load();
      }
    },
    [load],
  );

  const count = data?.categories.length;
  const tabBar = (
    <div className="flex items-center overflow-hidden rounded border border-border">
      {TABS.map((t, i) => (
        <Fragment key={t.v}>
          {i > 0 ? <span aria-hidden="true" className="h-4 w-px bg-border" /> : null}
          <button
            type="button"
            onClick={() => setTab(t.v)}
            aria-pressed={tab === t.v}
            className={`px-2 py-0.5 text-2xs ${
              tab === t.v ? "bg-bg-3 text-text-0" : "text-text-3 hover:text-text-1"
            }`}
          >
            {t.label}
          </button>
        </Fragment>
      ))}
    </div>
  );

  return (
    <DashboardCard title="Goals" count={count} expandHref={null} headerRight={tabBar}>
      {loading ? (
        <p className="px-3 py-4 text-center text-xs text-text-3">Loading…</p>
      ) : !data ? (
        <Empty />
      ) : tab === "archived" ? (
        <ArchivedTab onRestored={load} />
      ) : tab === "history" ? (
        <HistoryTab data={data} />
      ) : data.categories.length === 0 ? (
        <div className="flex flex-col">
          <Empty />
          <div className="border-t border-border/40 px-3 py-2">
            <NewAreaForm spaces={data.spaces} onAdd={onAddCategory} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          <GoalsTrack
            categories={data.categories}
            goals={data.goals}
            targetsByGoal={data.targetsByGoal}
            entriesByGoal={data.entriesByGoal}
            today={todayIso()}
            onLog={onLog}
            onAddGoal={onAddGoal}
            onUpdateGoal={onUpdateGoal}
            onArchiveGoal={onArchiveGoal}
            onUpdateCategory={onUpdateCategory}
            onArchiveCategory={onArchiveCategory}
            onReorderGoals={onReorderGoals}
            onReorderAreas={onReorderAreas}
          />
          <div className="border-t border-border/40 px-3 py-2">
            <NewAreaForm spaces={data.spaces} onAdd={onAddCategory} />
          </div>
        </div>
      )}
    </DashboardCard>
  );
}

/** Recent buckets per goal as a compact bar sparkline + the latest value. */
function HistoryTab({ data }: { data: Loaded }) {
  const today = todayIso();
  if (data.goals.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-text-3">No goals to chart yet.</p>;
  }
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  return (
    <div className="flex flex-col">
      {data.goals.map((g) => {
        const entries = data.entriesByGoal[g.id] ?? [];
        const target = data.targetsByGoal[g.id] ?? 0;
        const buckets = recentBuckets(g.period, today, 8).map((b) => {
          const total = sumInWindow(entries, b.start, b.end);
          return { ...b, total };
        });
        const max = Math.max(target, ...buckets.map((b) => b.total), 1);
        return (
          <div key={g.id} className="border-t border-border/40 px-3 py-2 first:border-t-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-text-0">{g.name}</span>
              <span className="text-[10px] text-text-3">{catName.get(g.category_id)}</span>
            </div>
            <div className="mt-1.5 flex h-10 items-end gap-1">
              {buckets.map((b) => (
                <span
                  key={b.start}
                  title={`${b.label}: ${b.total}`}
                  className="flex-1 rounded-sm bg-accent/70"
                  style={{ height: `${Math.max((b.total / max) * 100, 3)}%` }}
                />
              ))}
            </div>
            <div className="mt-0.5 flex justify-between text-[9px] text-text-3">
              <span>{buckets[0]?.label}</span>
              <span>now · {buckets[buckets.length - 1]?.total} / {target}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ArchivedTab({ onRestored }: { onRestored: () => Promise<void> }) {
  const [cats, setCats] = useState<GoalsCategoryRow[] | null>(null);
  const [goals, setGoals] = useState<GoalsGoalRow[]>([]);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const archivedCats = await loadArchivedCategories(supabase);
    const visible = await loadAllVisibleCategories(supabase);
    const ids = [...new Set([...visible.map((c) => c.id), ...archivedCats.map((c) => c.id)])];
    const archivedGoals = await loadArchivedGoals(supabase, ids);
    setCats(archivedCats);
    setGoals(archivedGoals);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function restoreGoal(id: string) {
    await setGoalArchived(createClient(), id, false);
    await reload();
    await onRestored();
  }
  async function restoreCat(id: string) {
    await setCategoryArchived(createClient(), id, false);
    await reload();
    await onRestored();
  }

  if (cats === null) return <p className="px-3 py-4 text-center text-xs text-text-3">Loading…</p>;
  if (cats.length === 0 && goals.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-text-3">Nothing archived.</p>;
  }
  return (
    <div className="flex flex-col">
      {cats.map((c) => (
        <RestoreRow key={c.id} label={c.name} sub="area" onRestore={() => restoreCat(c.id)} />
      ))}
      {goals.map((g) => (
        <RestoreRow key={g.id} label={g.name} sub={g.unit} onRestore={() => restoreGoal(g.id)} />
      ))}
    </div>
  );
}

function RestoreRow({
  label,
  sub,
  onRestore,
}: {
  label: string;
  sub: string;
  onRestore: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2 border-t border-border/40 px-3 py-2 text-xs first:border-t-0">
      <span className="min-w-0 flex-1 truncate text-text-1">{label}</span>
      <span className="text-[10px] text-text-3">{sub}</span>
      <button
        type="button"
        onClick={async () => {
          setBusy(true);
          try {
            await onRestore();
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        className="flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-2xs text-text-2 hover:text-text-0 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
        Restore
      </button>
    </div>
  );
}

interface Bucket {
  start: string;
  end: string;
  label: string;
}
function recentBuckets(period: GoalPeriod, today: string, n: number): Bucket[] {
  const out: Bucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    if (period === "monthly") {
      const [y, m] = today.split("-").map(Number);
      const d = new Date(Date.UTC(y, (m ?? 1) - 1 - i, 1));
      const iso = d.toISOString().slice(0, 10);
      const w = periodWindow("monthly", iso);
      out.push({ ...w, label: d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) });
    } else {
      const ref = new Date(Date.parse(startOfWeek(today)) - i * 7 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const w = periodWindow("weekly", ref);
      const md = new Date(Date.parse(w.start));
      out.push({
        ...w,
        label: md.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }),
      });
    }
  }
  return out;
}
function sumInWindow(entries: GoalsEntryRow[], start: string, end: string): number {
  return entries
    .filter((e) => e.entry_date >= start && e.entry_date <= end)
    .reduce((s, e) => s + Number(e.value), 0);
}

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

  useEffect(() => {
    if (!spaceId && spaces.length > 0) setSpaceId(spaces[0].id);
  }, [spaces, spaceId]);

  async function submit() {
    if (!name.trim() || !spaceId) return;
    setBusy(true);
    try {
      await onAdd(name.trim(), color, spaceId);
      setName("");
      setColor(SWATCHES[0]);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (spaces.length === 0) {
    return (
      <p className="text-[11px] text-text-3">Join or create a space to add goal areas.</p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-2xs text-text-3 hover:text-text-1"
      >
        <Plus className="h-3 w-3" /> New goal area
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
          <select aria-label="Space" value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className={inp}>
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
              className={`h-4 w-4 rounded-full ${color === sw ? "ring-2 ring-border-focus ring-offset-1 ring-offset-bg-1" : ""}`}
              style={{ background: sw }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !name.trim() || !spaceId}
          className="ml-auto rounded-sm border border-border bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
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
        Create a goal area, add goals with a target and cadence, then log your progress.
      </p>
    </div>
  );
}
