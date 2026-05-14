/**
 * Goals module manifest.
 *
 * Phase 0 stub. Phase 2 ports the standalone `Claude/rokki-goals/`
 * Next.js app into a first-class Rokki module: translate the JSON
 * store to Postgres tables with `space_id` / `terminal_id` columns,
 * mount routes at `/app/goals`, `/s/[slug]/goals`, `/p/[ticker]/goals`,
 * and ship a one-off import script at
 * `Claude/rokki-goals/scripts/import-to-supabase.ts`.
 *
 * Not `enabled_by_default` in `modules_catalog` — Goals is an opt-in
 * module, installed via marketplace per scope.
 */
import type { ModuleManifest } from "@rokki/sdk";

export const goalsManifest: ModuleManifest = {
  slug: "goals",
  name: "Goals",
  description: "Weekly numeric targets with daily entries.",
  icon: "target",
  scopes: ["user", "space", "terminal"],
  routes: {
    user: "/app/goals",
    space: "/s/[slug]/goals",
    terminal: "/p/[ticker]/goals",
  },
  fnKey: { label: "Goals", default: 5 },
};
