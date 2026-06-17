import Link from "next/link";
import { redirect } from "next/navigation";
import { Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ScopedModuleShell } from "@/components/pane/ScopedModuleShell";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

/**
 * `/modules/goals` — user-aggregated Goals view.
 *
 * Lists every scope (space or terminal) the viewer has Goals data
 * for, with a count of goals at each. Each row deep-links into the
 * per-scope view. RLS-scoped: the user only sees scopes they can
 * already see in `goals_categories`.
 *
 * Phase 2 keeps this read-only and navigation-only — the per-scope
 * page is where logging happens. A future iteration may add a global
 * "log to TICKER's Tour goal" command-palette shortcut.
 */
export default async function AppGoalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pull categories scoped per space + per terminal via RLS, then
  // join to the parent name for display. Two queries instead of one
  // because PostgREST embeds can be finicky across optional FKs and
  // these scale fine for small N.
  const { data: spaceCats } = await supabase
    .from("goals_categories")
    .select("space_id, spaces:space_id(slug, name)")
    .not("space_id", "is", null)
    .is("archived_at", null);
  const { data: termCats } = await supabase
    .from("goals_categories")
    .select("terminal_id, terminals:terminal_id(ticker, name)")
    .not("terminal_id", "is", null)
    .is("archived_at", null);

  type SR = {
    space_id: string;
    spaces: { slug: string; name: string } | null;
  };
  type TR = {
    terminal_id: string;
    terminals: { ticker: string; name: string } | null;
  };

  const spaceRows = (spaceCats ?? []) as SR[];
  const termRows = (termCats ?? []) as TR[];

  const spaceMap = new Map<string, { slug: string; name: string; count: number }>();
  for (const r of spaceRows) {
    if (!r.spaces) continue;
    const cur = spaceMap.get(r.space_id) ?? {
      slug: r.spaces.slug,
      name: r.spaces.name,
      count: 0,
    };
    cur.count += 1;
    spaceMap.set(r.space_id, cur);
  }

  const termMap = new Map<
    string,
    { ticker: string; name: string; count: number }
  >();
  for (const r of termRows) {
    if (!r.terminals) continue;
    const cur = termMap.get(r.terminal_id) ?? {
      ticker: r.terminals.ticker,
      name: r.terminals.name,
      count: 0,
    };
    cur.count += 1;
    termMap.set(r.terminal_id, cur);
  }

  return (
    <ScopedModuleShell scopeKind="user" activeSlug="goals">
      <div className="space-y-3 p-2 sm:p-3">
        <DashboardCard
          title="Goals by space"
          count={spaceMap.size}
          expandHref={null}
        >
          {spaceMap.size === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-3">
              No spaces with Goals installed yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {Array.from(spaceMap.entries()).map(([id, s]) => (
                <li key={id}>
                  <Link
                    href={`/s/${s.slug}/goals`}
                    className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-2"
                  >
                    <Target
                      className="h-3 w-3 flex-shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate text-text-0">
                      {s.name}
                    </span>
                    <span className="font-mono text-[10px] text-text-3">
                      {s.count} categor{s.count === 1 ? "y" : "ies"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard
          title="Goals by terminal"
          count={termMap.size}
          expandHref={null}
        >
          {termMap.size === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-3">
              No terminals with Goals installed yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {Array.from(termMap.entries()).map(([id, t]) => (
                <li key={id}>
                  <Link
                    href={`/p/${t.ticker}/goals`}
                    className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-2"
                  >
                    <Target
                      className="h-3 w-3 flex-shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate text-text-0">
                      <span className="font-mono text-[10px] text-accent">
                        {t.ticker}
                      </span>{" "}
                      · {t.name}
                    </span>
                    <span className="font-mono text-[10px] text-text-3">
                      {t.count} categor{t.count === 1 ? "y" : "ies"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      </div>
    </ScopedModuleShell>
  );
}
