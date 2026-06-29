/**
 * Goals module queries — Postgres port of the JSON-store actions at
 * `Claude/rokki-goals/lib/actions.ts`. RLS does the access control;
 * these helpers just shape the responses for the UI.
 *
 * Scope is implicit in every call: the caller passes `scope` +
 * `scopeId` and the queries scope `goals_categories` accordingly.
 * Sub-tables (goals_goals, goals_targets, goals_entries) inherit
 * scope via the FK chain back to `goals_categories`.
 */

type Db = any; // eslint-disable-line

export type GoalsScope =
  | { kind: "space"; spaceId: string }
  | { kind: "terminal"; terminalId: string };

export interface GoalsCategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  display_order: number;
  archived_at: string | null;
}

export interface GoalsGoalRow {
  id: string;
  category_id: string;
  name: string;
  unit: string;
  display_order: number;
  source_type: "manual" | "auto";
  source_config: Record<string, unknown> | null;
  archived_at: string | null;
}

export interface GoalsTargetRow {
  id: string;
  goal_id: string;
  weekly_target: number;
  valid_from: string;
}

export interface GoalsEntryRow {
  id: string;
  goal_id: string;
  entry_date: string;
  value: number;
  source: string;
  notes: string | null;
}

function scopeColumn(scope: GoalsScope): {
  column: "space_id" | "terminal_id";
  value: string;
} {
  if (scope.kind === "space") return { column: "space_id", value: scope.spaceId };
  return { column: "terminal_id", value: scope.terminalId };
}

/**
 * Load every non-archived category at this scope. Sorted by
 * `display_order` so the UI doesn't have to.
 */
export async function loadCategories(
  supabase: Db,
  scope: GoalsScope,
): Promise<GoalsCategoryRow[]> {
  const { column, value } = scopeColumn(scope);
  const { data } = await supabase
    .from("goals_categories")
    .select("id, name, color, icon, display_order, archived_at")
    .eq(column, value)
    .is("archived_at", null)
    .order("display_order", { ascending: true });
  return (data ?? []) as GoalsCategoryRow[];
}

/**
 * Every non-archived category the caller can see, across ALL scopes
 * (RLS does the scoping). Powers the dashboard Goals panel, which is
 * scope-agnostic — it shows everything you're tracking in one place.
 * For a single scope use {@link loadCategories} instead.
 */
export async function loadAllVisibleCategories(
  supabase: Db,
): Promise<GoalsCategoryRow[]> {
  const { data } = await supabase
    .from("goals_categories")
    .select("id, name, color, icon, display_order, archived_at")
    .is("archived_at", null)
    .order("display_order", { ascending: true });
  return (data ?? []) as GoalsCategoryRow[];
}

/** Non-archived goals under the given category ids (scope-agnostic). */
export async function loadGoalsForCategories(
  supabase: Db,
  categoryIds: string[],
): Promise<GoalsGoalRow[]> {
  if (categoryIds.length === 0) return [];
  const { data } = await supabase
    .from("goals_goals")
    .select(
      "id, category_id, name, unit, display_order, source_type, source_config, archived_at",
    )
    .in("category_id", categoryIds)
    .is("archived_at", null)
    .order("display_order", { ascending: true });
  return (data ?? []) as GoalsGoalRow[];
}

/**
 * Load every non-archived goal under a scope's categories. Joins are
 * done in two passes (cheap for goal counts in the dozens; rewrite as
 * a single query if we ever cross 1000 goals at one scope).
 */
export async function loadGoals(
  supabase: Db,
  scope: GoalsScope,
): Promise<GoalsGoalRow[]> {
  const categories = await loadCategories(supabase, scope);
  if (categories.length === 0) return [];
  const { data } = await supabase
    .from("goals_goals")
    .select(
      "id, category_id, name, unit, display_order, source_type, source_config, archived_at",
    )
    .in(
      "category_id",
      categories.map((c) => c.id),
    )
    .is("archived_at", null)
    .order("display_order", { ascending: true });
  return (data ?? []) as GoalsGoalRow[];
}

/**
 * Most-recent target for each goal, valid as of `asOf`. If no target
 * has been set for a goal yet, that goal is absent from the result.
 */
export async function loadCurrentTargets(
  supabase: Db,
  goalIds: string[],
  asOf: string,
): Promise<Map<string, number>> {
  if (goalIds.length === 0) return new Map();
  const { data } = await supabase
    .from("goals_targets")
    .select("goal_id, weekly_target, valid_from")
    .in("goal_id", goalIds)
    .lte("valid_from", asOf)
    .order("valid_from", { ascending: false });
  type Row = { goal_id: string; weekly_target: number; valid_from: string };
  const rows = (data ?? []) as Row[];
  // First row per goal is the most recent eligible target.
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!out.has(r.goal_id)) out.set(r.goal_id, Number(r.weekly_target));
  }
  return out;
}

/**
 * Entries within a [start, end] date range for the given goals.
 * Returned as a Map<goalId, Entry[]> so consumers can render
 * per-goal day-strips without re-bucketing.
 */
export async function loadEntries(
  supabase: Db,
  goalIds: string[],
  start: string,
  end: string,
): Promise<Map<string, GoalsEntryRow[]>> {
  if (goalIds.length === 0) return new Map();
  const { data } = await supabase
    .from("goals_entries")
    .select("id, goal_id, entry_date, value, source, notes")
    .in("goal_id", goalIds)
    .gte("entry_date", start)
    .lte("entry_date", end)
    .order("entry_date", { ascending: true });
  const rows = (data ?? []) as GoalsEntryRow[];
  const out = new Map<string, GoalsEntryRow[]>();
  for (const r of rows) {
    const list = out.get(r.goal_id) ?? [];
    list.push(r);
    out.set(r.goal_id, list);
  }
  return out;
}

/**
 * Sum of entries for each goal within [start, end]. Used by the
 * weekly view's "X / target" totals.
 */
export async function sumWeekValues(
  supabase: Db,
  goalIds: string[],
  start: string,
  end: string,
): Promise<Map<string, number>> {
  const entries = await loadEntries(supabase, goalIds, start, end);
  const out = new Map<string, number>();
  for (const [goalId, list] of entries.entries()) {
    out.set(
      goalId,
      list.reduce((acc, e) => acc + Number(e.value), 0),
    );
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────── */
/* Mutations — write paths                                            */
/* ────────────────────────────────────────────────────────────────── */

export async function createCategory(
  supabase: Db,
  scope: GoalsScope,
  input: { name: string; color: string; icon?: string | null },
): Promise<GoalsCategoryRow> {
  const { column, value } = scopeColumn(scope);
  const payload = {
    [column]: value,
    name: input.name.trim(),
    color: input.color,
    icon: input.icon ?? null,
  };
  const { data, error } = await supabase
    .from("goals_categories")
    .insert(payload as never)
    .select("id, name, color, icon, display_order, archived_at")
    .single();
  if (error) throw error;
  return data as GoalsCategoryRow;
}

export async function createGoal(
  supabase: Db,
  input: { category_id: string; name: string; unit: string },
): Promise<GoalsGoalRow> {
  const { data, error } = await supabase
    .from("goals_goals")
    .insert({
      category_id: input.category_id,
      name: input.name.trim(),
      unit: input.unit.trim(),
    } as never)
    .select(
      "id, category_id, name, unit, display_order, source_type, source_config, archived_at",
    )
    .single();
  if (error) throw error;
  return data as GoalsGoalRow;
}

export async function setWeeklyTarget(
  supabase: Db,
  input: { goal_id: string; weekly_target: number; valid_from: string },
): Promise<void> {
  // Upsert by (goal_id, valid_from) so re-targeting same week updates.
  const { error } = await supabase
    .from("goals_targets")
    .upsert(
      {
        goal_id: input.goal_id,
        weekly_target: input.weekly_target,
        valid_from: input.valid_from,
      } as never,
      { onConflict: "goal_id,valid_from" },
    );
  if (error) throw error;
}

/**
 * ADD `delta` to a goal's running total for `entryDate`, atomically (single
 * INSERT…ON CONFLICT in the `goals_add_entry` RPC — no read-modify-write race).
 * The total is clamped at 0. Use this for the dashboard "+N" quick-log; use
 * {@link recordEntry} when SETTING an exact day value.
 */
export async function addEntryValue(
  supabase: Db,
  goalId: string,
  entryDate: string,
  delta: number,
): Promise<void> {
  const { error } = await supabase.rpc("goals_add_entry", {
    p_goal_id: goalId,
    p_entry_date: entryDate,
    p_delta: delta,
  });
  if (error) throw error;
}

export async function recordEntry(
  supabase: Db,
  input: {
    goal_id: string;
    entry_date: string;
    value: number;
    notes?: string | null;
  },
): Promise<void> {
  // Same one-per-goal-per-date semantics as the JSON store.
  const { error } = await supabase
    .from("goals_entries")
    .upsert(
      {
        goal_id: input.goal_id,
        entry_date: input.entry_date,
        value: input.value,
        notes: input.notes ?? null,
        source: "manual",
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "goal_id,entry_date" },
    );
  if (error) throw error;
}
