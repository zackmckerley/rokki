/**
 * Scope resolution helpers — translate URL params into the
 * `PaneScope` shape the pane shell needs, plus look up which modules
 * are installed on that scope.
 *
 * Used by the new `/modules/<slug>`, `/s/[slug]/<module>`, and
 * `/p/[ticker]/<module>` route files. Lives in `lib/` rather than
 * inside `components/pane/` because it's pure server logic — the
 * shell components are client-side rendering only.
 */
import type {
  InstalledModuleEntry,
  PaneScope,
} from "@/components/pane/types";

// `any` here matches the rest of the dashboard helpers — ssr-cookie
// and plain supabase-js produce slightly different generic shapes,
// and our generated Database types track the post-rename schema.
type Db = any; // eslint-disable-line

/**
 * Resolve a `?focus=<id>` style scope id to a fully-shaped `PaneScope`
 * including label. The caller is responsible for narrowing access via
 * RLS — these helpers only assemble the display data.
 */
export async function resolveSpaceScope(
  supabase: Db,
  slug: string,
): Promise<PaneScope | null> {
  const { data } = await supabase
    .from("spaces")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  const row = data as { id: string; slug: string; name: string } | null;
  if (!row) return null;
  return {
    kind: "space",
    id: row.id,
    slug: row.slug,
    label: row.name.toUpperCase(),
  };
}

export async function resolveTerminalScope(
  supabase: Db,
  ticker: string,
): Promise<PaneScope | null> {
  const { data } = await supabase
    .from("terminals")
    .select("id, ticker, name, space:space_id(name)")
    .eq("ticker", ticker.toUpperCase())
    .is("archived_at", null)
    .maybeSingle();
  type Row = {
    id: string;
    ticker: string;
    name: string;
    space: { name: string } | null;
  };
  const row = data as Row | null;
  if (!row) return null;
  const prefix = row.space?.name ? `${row.space.name.toUpperCase()} / ` : "";
  return {
    kind: "terminal",
    id: row.id,
    ticker: row.ticker,
    label: `${prefix}${row.name}`,
  };
}

/**
 * Load modules installed on the given scope, decorated with their
 * catalog name/icon. Archived rows are excluded.
 *
 * For the user-aggregated `/modules/<slug>` views, callers pass
 * `scopeKind: "user"`. There's no `user_modules` table — the user
 * scope just renders every module that supports `user` in its
 * manifest, so this helper returns an empty array and the caller
 * substitutes the manifest list.
 */
export async function loadInstalledModules(
  supabase: Db,
  scopeKind: "space" | "terminal",
  scopeId: string,
): Promise<InstalledModuleEntry[]> {
  const table = scopeKind === "space" ? "space_modules" : "terminal_modules";
  const fk = scopeKind === "space" ? "space_id" : "terminal_id";
  const { data } = await supabase
    .from(table)
    .select(
      `slug, display_order, modules_catalog(name, icon)`,
    )
    .eq(fk, scopeId)
    .is("archived_at", null)
    .order("display_order", { ascending: true });
  type Row = {
    slug: string;
    display_order: number;
    modules_catalog: { name: string; icon: string | null } | null;
  };
  const rows = (data ?? []) as Row[];
  return rows.map((r) => ({
    slug: r.slug,
    name: r.modules_catalog?.name ?? r.slug,
    icon: r.modules_catalog?.icon ?? "square",
    scope: scopeKind,
    displayOrder: r.display_order,
    pinned: true, // Phase 1: everything's pinned until user_module_pins is wired in Phase 4
  }));
}

/**
 * Load the viewer's pins for a given scope. Returns rows from
 * `user_module_pins` for the current user + scope. Empty array if
 * the user hasn't pinned anything (the shell falls back to default
 * ordering).
 */
export async function loadUserPins(
  supabase: Db,
  userId: string,
  scopeKind: "user" | "space" | "terminal",
  scopeId: string | null,
): Promise<{ slug: string; displayOrder: number; fnKey: number | null }[]> {
  let query = supabase
    .from("user_module_pins")
    .select("slug, display_order, fn_key")
    .eq("user_id", userId)
    .eq("scope_kind", scopeKind);
  if (scopeId === null) {
    query = query.is("scope_id", null);
  } else {
    query = query.eq("scope_id", scopeId);
  }
  const { data } = await query;
  type Row = {
    slug: string;
    display_order: number;
    fn_key: number | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    slug: r.slug,
    displayOrder: r.display_order,
    fnKey: r.fn_key,
  }));
}

/**
 * Apply user pins on top of installed modules.
 *
 * Semantics:
 *   - Modules the user has explicitly pinned (regardless of pin
 *     `displayOrder`) are surfaced first, in pin order.
 *   - Modules without a pin fall back behind, keeping their
 *     installed order.
 *   - A pin with `displayOrder = -1` is a sentinel meaning "hide" —
 *     that module is filtered out entirely.
 *
 * The result list keeps every entry's `pinned: true` for now; Phase 4
 * (drag-to-reorder UI) will use the pin's `displayOrder` to render
 * the user's preferred sequence.
 */
export function applyPins(
  installed: InstalledModuleEntry[],
  pins: { slug: string; displayOrder: number; fnKey: number | null }[],
): InstalledModuleEntry[] {
  const byPin = new Map(pins.map((p) => [p.slug, p]));

  // Drop hidden modules (displayOrder = -1 sentinel).
  const visible = installed.filter((m) => {
    const p = byPin.get(m.slug);
    return !p || p.displayOrder >= 0;
  });

  // Pinned (with non-sentinel pin) first, ordered by pin displayOrder.
  // Non-pinned keep their installed order behind. Insertion-order-stable
  // for ties so test assertions remain deterministic.
  const pinned = visible
    .filter((m) => byPin.has(m.slug))
    .sort((a, b) => {
      const pa = byPin.get(a.slug)!;
      const pb = byPin.get(b.slug)!;
      return pa.displayOrder - pb.displayOrder;
    })
    .map((m) => {
      const p = byPin.get(m.slug)!;
      return { ...m, displayOrder: p.displayOrder, pinned: true };
    });
  const notPinned = visible.filter((m) => !byPin.has(m.slug));
  return [...pinned, ...notPinned];
}
