import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { ModulesMarketplace } from "@/components/modules/ModulesMarketplace";

interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * `/p/[ticker]/settings/modules` — module marketplace at terminal scope.
 *
 * Mirror of the space-scope page; uses the same `ModulesMarketplace`
 * component to keep the UX identical between scopes.
 */
export default async function TerminalModulesPage({ params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: terminalRow } = await supabase
    .from("terminals")
    .select("id, name, ticker")
    .eq("ticker", ticker.toUpperCase())
    .is("archived_at", null)
    .maybeSingle();
  const terminal = terminalRow as
    | { id: string; name: string; ticker: string }
    | null;
  if (!terminal) redirect("/");

  const { data: catRows } = await supabase
    .from("modules_catalog")
    .select("slug, name, description, icon, scopes")
    .contains("scopes", ["terminal"])
    .order("name", { ascending: true });
  type Cat = {
    slug: string;
    name: string;
    description: string;
    icon: string | null;
    scopes: string[];
  };
  const catalog = (catRows ?? []) as Cat[];

  const { data: installedRows } = await supabase
    .from("terminal_modules")
    .select("slug, installed_at, installed_by")
    .eq("terminal_id", terminal.id)
    .is("archived_at", null);
  type Inst = { slug: string; installed_at: string; installed_by: string };
  const installed = (installedRows ?? []) as Inst[];

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link
          href={`/p/${terminal.ticker}/settings`}
          className="text-text-3 hover:text-text-1"
        >
          ← Settings
        </Link>
        <span className="text-text-3">·</span>
        <span className="font-mono text-[11px] uppercase tracking-wide text-text-2">
          {terminal.ticker}
        </span>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Modules</span>
      </TopBar>
      <main className="mx-auto w-full max-w-3xl flex-1 p-4">
        <ModulesMarketplace
          scopeKind="terminal"
          scopeKey={terminal.id}
          scopeLabel={terminal.name}
          catalog={catalog}
          installed={installed}
        />
      </main>
    </div>
  );
}
