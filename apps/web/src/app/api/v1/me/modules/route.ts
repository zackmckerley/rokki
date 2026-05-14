import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

/**
 * GET /api/v1/me/modules
 *
 * Returns the union of module installations across every scope the
 * caller can see: their personal pins (scope_kind='user'), each space
 * they belong to, and each terminal they belong to. The pane shell
 * uses this to build the global "where is module X installed?"
 * picture for the cross-scope command palette.
 *
 * Result shape:
 *   {
 *     data: {
 *       installations: Array<{
 *         scope_kind: 'space' | 'terminal';
 *         scope_id: string;
 *         scope_label: string;     // space name OR `${spaceName} / ${terminalName}`
 *         slug: string;
 *         name: string;            // from modules_catalog
 *         icon: string | null;
 *         installed_at: string;
 *       }>;
 *       pins: Array<{
 *         scope_kind: 'user' | 'space' | 'terminal';
 *         scope_id: string | null;
 *         slug: string;
 *         display_order: number;
 *         fn_key: number | null;
 *       }>;
 *     }
 *   }
 */
async function handleGet(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
      { status: 401 },
    );

  // RLS scopes both queries to the caller's visible rows already, so
  // there's no need for an extra WHERE here.
  const [spaceMods, terminalMods, pins] = await Promise.all([
    supabase
      .from("space_modules")
      .select(
        "slug, installed_at, spaces:space_id(id, name), modules_catalog(name, icon)",
      )
      .is("archived_at", null),
    supabase
      .from("terminal_modules")
      .select(
        "slug, installed_at, terminals:terminal_id(id, name, space:space_id(name)), modules_catalog(name, icon)",
      )
      .is("archived_at", null),
    supabase
      .from("user_module_pins")
      .select("scope_kind, scope_id, slug, display_order, fn_key")
      .eq("user_id", user.id),
  ]);

  type SpaceRow = {
    slug: string;
    installed_at: string;
    spaces: { id: string; name: string } | null;
    modules_catalog: { name: string; icon: string | null } | null;
  };
  type TerminalRow = {
    slug: string;
    installed_at: string;
    terminals:
      | {
          id: string;
          name: string;
          space: { name: string } | null;
        }
      | null;
    modules_catalog: { name: string; icon: string | null } | null;
  };

  const installations: Array<{
    scope_kind: "space" | "terminal";
    scope_id: string;
    scope_label: string;
    slug: string;
    name: string;
    icon: string | null;
    installed_at: string;
  }> = [];

  for (const r of (spaceMods.data ?? []) as SpaceRow[]) {
    if (!r.spaces) continue;
    installations.push({
      scope_kind: "space",
      scope_id: r.spaces.id,
      scope_label: r.spaces.name,
      slug: r.slug,
      name: r.modules_catalog?.name ?? r.slug,
      icon: r.modules_catalog?.icon ?? null,
      installed_at: r.installed_at,
    });
  }
  for (const r of (terminalMods.data ?? []) as TerminalRow[]) {
    if (!r.terminals) continue;
    const spaceName = r.terminals.space?.name ?? "Unknown space";
    installations.push({
      scope_kind: "terminal",
      scope_id: r.terminals.id,
      scope_label: `${spaceName} / ${r.terminals.name}`,
      slug: r.slug,
      name: r.modules_catalog?.name ?? r.slug,
      icon: r.modules_catalog?.icon ?? null,
      installed_at: r.installed_at,
    });
  }

  return NextResponse.json({
    data: {
      installations,
      pins: pins.data ?? [],
    },
  });
}

export const GET = withObservability(handleGet, "GET /api/v1/me/modules");
