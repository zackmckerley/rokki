/**
 * F-key resolver — maps a function key event to a navigation target.
 *
 * F1-F4 are reserved (Help / Tasks / Files / Tools) per
 * `docs/08_UI_DESIGN.md §8.15.5`. F5-F10 are user-pinnable via
 * `user_module_pins.fn_key`.
 *
 * The resolver is pure: it takes a key + the current scope + the
 * loaded pin map and returns either a URL string to navigate to or
 * null. The handler that mounts it on `window` lives in
 * `useFKeyShortcuts` (client hook).
 *
 * Kept separate from the hook so it can be unit-tested without
 * jsdom.
 */
import { listManifestsForScope } from "@rokki/sdk";

export type FKeyScopeKind = "user" | "space" | "terminal";

export interface FKeyScope {
  kind: FKeyScopeKind;
  /** For space: slug. For terminal: ticker. Undefined for user. */
  key?: string;
}

export interface FKeyPin {
  slug: string;
  fnKey: number; // 5..10
}

/**
 * F1-F4 fixed assignments. These match the F-key shelf in the
 * sketch and don't change per user.
 *
 * F4 (Tools) is intentionally null per locked decision #5 — Tools
 * is out of scope for v1 modules. The shelf renders it greyed.
 */
const FIXED: Record<number, string | null> = {
  1: "/help",
  2: "/app/tasks",
  3: "/app/messenger",
  4: null,
};

/**
 * Resolve a key like "F5" to a URL.
 *
 * Returns:
 *   - a string href when the key has a binding
 *   - null when the key is reserved-but-unbound (F4) or unpinned
 *
 * `pins` should be the *current scope's* pins. The caller is
 * responsible for loading those (server load on page, or
 * `/api/v1/me/module-pins` from the client).
 */
export function resolveFKey(
  key: string,
  scope: FKeyScope,
  pins: FKeyPin[],
): string | null {
  const m = /^F(\d{1,2})$/.exec(key);
  if (!m) return null;
  const n = Number(m[1]);
  if (Number.isNaN(n)) return null;
  if (n in FIXED) return FIXED[n];
  if (n < 5 || n > 10) return null;
  const pin = pins.find((p) => p.fnKey === n);
  if (!pin) return null;
  return urlForSlug(pin.slug, scope);
}

/**
 * Build a route for `slug` at the given scope by reading the
 * manifest. Returns null if the manifest doesn't expose that scope.
 *
 * Exported for use by the command palette resolver too.
 */
export function urlForSlug(slug: string, scope: FKeyScope): string | null {
  const m = listManifestsForScope(scope.kind).find((x) => x.slug === slug);
  if (!m) return null;
  const pattern = m.routes[scope.kind];
  if (!pattern) return null;
  if (scope.kind === "user") return pattern;
  if (!scope.key) return null;
  if (scope.kind === "space") return pattern.replace("[slug]", scope.key);
  return pattern.replace("[ticker]", scope.key);
}
