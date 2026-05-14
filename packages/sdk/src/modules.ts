/**
 * Rokki module-system manifest contract.
 *
 * Every module — old or new — exposes the same shape so the pane
 * shell can mount it generically. The manifest is declarative — it
 * tells the shell where the module's pages live and which scopes it
 * applies to. Optional `install` / `uninstall` hooks let a module
 * seed or archive its own data when it's added to or removed from a
 * scope.
 *
 * Manifests live at `apps/web/src/modules/<slug>/manifest.ts` and
 * register themselves with the registry at startup. See
 * `packages/sdk/src/module-registry.ts` and
 * `docs/adr/0004-module-system-pane-tabs.md` for the rationale.
 *
 * Locked-in for v1 (see `Claude/rokki-goals/MODULE_PLAN.md §8`):
 *   - No `tools` field. Tools are a separate effort.
 *   - "Overview" is NOT a manifest entry — it's a synthesized
 *     landing screen rendered by the shell when no module is active.
 *   - User-aggregated views live at `/app/<slug>`.
 */

export type ModuleScope = "user" | "space" | "terminal";
export type ModuleVertical = "realestate" | "construction" | "legal";

/**
 * Manifest entry for a single module. The `slug` must match a row in
 * the `modules_catalog` table.
 */
export interface ModuleManifest {
  /** Stable identifier. Matches `modules_catalog.slug`. */
  slug: string;
  /** Display name shown in the marketplace and tab strip. */
  name: string;
  /** One-line description for the marketplace card. */
  description: string;
  /** Lucide icon name (e.g. `"check-square"`). */
  icon: string;
  /** Scopes this module supports — at least one. */
  scopes: ModuleScope[];
  /**
   * Optional vertical filter. If set, the module only appears in the
   * marketplace for spaces/terminals using a matching template. Leave
   * undefined to make it universally available.
   */
  vertical?: ModuleVertical | null;
  /**
   * Where the module's pages live at each scope. Keys correspond to
   * `scopes`. Use Next.js route patterns (`[slug]`, `[ticker]`).
   */
  routes: {
    user?: string;
    space?: string;
    terminal?: string;
  };
  /**
   * Optional install hook. Called once when the module is added to a
   * scope — seed default config, create starter content, etc. The
   * SQL-side install (writing to `space_modules` / `terminal_modules`)
   * happens before this runs; only run "extras" here.
   */
  install?: (ctx: InstallContext) => Promise<void>;
  /**
   * Optional uninstall hook. Called when the module is archived from
   * a scope. **Archive only — never delete the module's data tables.**
   * Reinstalling the module should restore the user's previous
   * configuration intact.
   */
  uninstall?: (ctx: InstallContext) => Promise<void>;
  /**
   * Optional default F-key binding (5..10). The user can override via
   * `user_module_pins.fn_key`.
   */
  fnKey?: { label: string; default?: number };
}

/**
 * Passed to install/uninstall hooks. The `supabase` client is
 * authenticated as the caller and goes through RLS — the hook can
 * only touch what the caller can already touch.
 */
export interface InstallContext {
  // Loosely typed to avoid pulling the supabase-js types into the SDK
  // bundle. The web app casts to `SupabaseClient<Database>` at the
  // call site.
  supabase: unknown;
  scope: "space" | "terminal";
  /** `spaces.id` or `terminals.id` depending on `scope`. */
  scopeId: string;
  /** `auth.users.id` of the actor. */
  userId: string;
  /** Optional config payload from the install wizard. */
  config?: Record<string, unknown>;
}

/**
 * Type guard: does this manifest support the given scope?
 *
 * Cheap helper used by the pane shell and the marketplace UI when
 * filtering the catalog down to what's valid at a particular scope.
 */
export function manifestSupportsScope(
  m: ModuleManifest,
  scope: ModuleScope,
): boolean {
  return m.scopes.includes(scope);
}
