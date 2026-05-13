#!/usr/bin/env tsx
/**
 * One-off importer for the standalone rokki-goals JSON store.
 *
 * Reads `Claude/rokki-goals/data/rokki-goals.json` and inserts the
 * categories, goals, targets, and entries into the rokki Supabase
 * tables under a single chosen space.
 *
 * Lives at `rokki-goals-import/` rather than inside `Claude/rokki-goals/`
 * so it ships with the rokki monorepo and can be reverted via the
 * same `git revert` flow as the migration if needed (per
 * `MODULE_PLAN.md §11`). Run once, then this script is deprecated.
 *
 * Usage:
 *   pnpm tsx rokki-goals-import/import-to-supabase.ts \
 *     --json "Claude/rokki-goals/data/rokki-goals.json" \
 *     --space <space-slug> \
 *     [--terminal <ticker>]    # optional: import to a terminal instead
 *
 * Env vars required:
 *   SUPABASE_URL              — usually NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (bypasses RLS for import)
 *
 * Dry-run by default; pass `--commit` to actually write.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

interface Args {
  json: string;
  space?: string;
  terminal?: string;
  commit: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = { json: "", commit: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") out.json = args[++i]!;
    else if (a === "--space") out.space = args[++i]!;
    else if (a === "--terminal") out.terminal = args[++i]!;
    else if (a === "--commit") out.commit = true;
  }
  if (!out.json) throw new Error("--json <path> is required");
  if (!out.space && !out.terminal)
    throw new Error("one of --space <slug> or --terminal <ticker> is required");
  if (out.space && out.terminal)
    throw new Error("pass exactly one of --space or --terminal");
  return out;
}

interface JsonCategory {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  display_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
interface JsonGoal {
  id: string;
  category_id: string;
  name: string;
  unit: string;
  display_order: number;
  source_type: "manual" | "auto";
  source_config: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
interface JsonTarget {
  id: string;
  goal_id: string;
  weekly_target: number;
  valid_from: string;
  created_at: string;
}
interface JsonEntry {
  id: string;
  goal_id: string;
  entry_date: string;
  value: number;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface JsonStore {
  categories: JsonCategory[];
  goals: JsonGoal[];
  targets: JsonTarget[];
  entries: JsonEntry[];
}

async function main() {
  const args = parseArgs();
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set in the environment.",
    );
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const raw = readFileSync(resolve(args.json), "utf8");
  const store = JSON.parse(raw) as JsonStore;
  console.log(
    `Loaded ${store.categories.length} categories, ${store.goals.length} goals, ${store.targets.length} targets, ${store.entries.length} entries from ${args.json}`,
  );

  // Resolve the destination scope.
  let scopeColumn: "space_id" | "terminal_id";
  let scopeId: string;
  if (args.space) {
    const { data } = await supabase
      .from("spaces")
      .select("id, name")
      .eq("slug", args.space)
      .maybeSingle();
    if (!data) throw new Error(`Space "${args.space}" not found.`);
    scopeColumn = "space_id";
    scopeId = (data as { id: string }).id;
    console.log(`Target: space "${args.space}" (id=${scopeId})`);
  } else {
    const { data } = await supabase
      .from("terminals")
      .select("id, name")
      .eq("ticker", args.terminal!.toUpperCase())
      .maybeSingle();
    if (!data) throw new Error(`Terminal "${args.terminal}" not found.`);
    scopeColumn = "terminal_id";
    scopeId = (data as { id: string }).id;
    console.log(`Target: terminal "${args.terminal}" (id=${scopeId})`);
  }

  if (!args.commit) {
    console.log("\n[dry-run] would insert:");
    console.log(`  ${store.categories.length} categories`);
    console.log(`  ${store.goals.length} goals`);
    console.log(`  ${store.targets.length} targets`);
    console.log(`  ${store.entries.length} entries`);
    console.log(
      "\nRe-run with --commit to actually write. Service role bypasses RLS — only run against the right destination.",
    );
    return;
  }

  // Build id-translation maps (JSON ids → fresh Postgres UUIDs come from the DB).
  const categoryIdMap = new Map<string, string>();
  const goalIdMap = new Map<string, string>();

  // 1. Categories.
  for (const c of store.categories) {
    const insert = {
      [scopeColumn]: scopeId,
      name: c.name,
      color: c.color,
      icon: c.icon,
      display_order: c.display_order,
      archived_at: c.archived_at,
      created_at: c.created_at,
      updated_at: c.updated_at,
    };
    const { data, error } = await supabase
      .from("goals_categories")
      .insert(insert as never)
      .select("id")
      .single();
    if (error) throw new Error(`category insert failed: ${error.message}`);
    categoryIdMap.set(c.id, (data as { id: string }).id);
  }
  console.log(`Inserted ${categoryIdMap.size} categories.`);

  // 2. Goals.
  for (const g of store.goals) {
    const newCategoryId = categoryIdMap.get(g.category_id);
    if (!newCategoryId) {
      console.warn(
        `Skipping goal ${g.id} — parent category ${g.category_id} not in import set`,
      );
      continue;
    }
    const insert = {
      category_id: newCategoryId,
      name: g.name,
      unit: g.unit,
      display_order: g.display_order,
      source_type: g.source_type,
      source_config: g.source_config ? JSON.parse(g.source_config) : null,
      archived_at: g.archived_at,
      created_at: g.created_at,
      updated_at: g.updated_at,
    };
    const { data, error } = await supabase
      .from("goals_goals")
      .insert(insert as never)
      .select("id")
      .single();
    if (error) throw new Error(`goal insert failed: ${error.message}`);
    goalIdMap.set(g.id, (data as { id: string }).id);
  }
  console.log(`Inserted ${goalIdMap.size} goals.`);

  // 3. Targets.
  let targetCount = 0;
  for (const t of store.targets) {
    const newGoalId = goalIdMap.get(t.goal_id);
    if (!newGoalId) continue;
    const { error } = await supabase
      .from("goals_targets")
      .insert({
        goal_id: newGoalId,
        weekly_target: t.weekly_target,
        valid_from: t.valid_from,
        created_at: t.created_at,
      } as never);
    if (error) throw new Error(`target insert failed: ${error.message}`);
    targetCount += 1;
  }
  console.log(`Inserted ${targetCount} targets.`);

  // 4. Entries.
  let entryCount = 0;
  for (const e of store.entries) {
    const newGoalId = goalIdMap.get(e.goal_id);
    if (!newGoalId) continue;
    const { error } = await supabase
      .from("goals_entries")
      .insert({
        goal_id: newGoalId,
        entry_date: e.entry_date,
        value: e.value,
        source: e.source,
        notes: e.notes,
        created_at: e.created_at,
        updated_at: e.updated_at,
      } as never);
    if (error) throw new Error(`entry insert failed: ${error.message}`);
    entryCount += 1;
  }
  console.log(`Inserted ${entryCount} entries.`);

  console.log("\nDone.");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
