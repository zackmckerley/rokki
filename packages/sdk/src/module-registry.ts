/**
 * In-process module registry.
 *
 * Each module's `manifest.ts` calls `registerModule(manifest)` at
 * import time. The pane shell, the marketplace UI, and the install
 * server actions read from this registry to resolve a slug to its
 * full manifest.
 *
 * Why in-process: the manifest is declarative + tiny, and there are
 * five of them in v1. Loading them via `import` from
 * `apps/web/src/modules/index.ts` (which side-effect-imports each
 * `<slug>/manifest.ts`) keeps the registry warm without a DB
 * round-trip.
 *
 * The DB-side truth — which modules are installed where — lives in
 * `modules_catalog`, `space_modules`, `terminal_modules`. The
 * registry is the in-process *capability* layer; the DB is the
 * *state* layer.
 */
import type { ModuleManifest, ModuleScope } from "./modules.js";

const REGISTRY = new Map<string, ModuleManifest>();

/**
 * Register a module manifest. Idempotent — calling twice with the
 * same slug throws so a typo can't silently overwrite an existing
 * registration during HMR.
 */
export function registerModule(manifest: ModuleManifest): void {
  const existing = REGISTRY.get(manifest.slug);
  if (existing && existing !== manifest) {
    throw new Error(
      `Module "${manifest.slug}" already registered with a different manifest. ` +
        `Two manifests must not share a slug.`,
    );
  }
  REGISTRY.set(manifest.slug, manifest);
}

/**
 * Look up a manifest by slug. Returns undefined if unregistered —
 * callers should treat that as "module not available in this
 * deployment" rather than as a programming error.
 */
export function getModuleManifest(slug: string): ModuleManifest | undefined {
  return REGISTRY.get(slug);
}

/**
 * Snapshot every registered manifest. Order matches insertion order.
 */
export function listModuleManifests(): readonly ModuleManifest[] {
  return Array.from(REGISTRY.values());
}

/**
 * Filter the registry to manifests valid at the given scope. Used by
 * the marketplace UI to show only modules a space can install vs.
 * what a terminal can install.
 */
export function listManifestsForScope(
  scope: ModuleScope,
): readonly ModuleManifest[] {
  return listModuleManifests().filter((m) => m.scopes.includes(scope));
}

/**
 * Resolve the route a manifest exposes for a given scope. Returns
 * undefined if the module doesn't support that scope. Caller is
 * responsible for substituting URL parameters (`[slug]`, `[ticker]`).
 */
export function routeForScope(
  manifest: ModuleManifest,
  scope: ModuleScope,
): string | undefined {
  return manifest.routes[scope];
}

/**
 * Test helper — clear the registry. Production code should never
 * call this; the registry is built once at startup.
 *
 * @internal
 */
export function __resetModuleRegistryForTests(): void {
  REGISTRY.clear();
}
