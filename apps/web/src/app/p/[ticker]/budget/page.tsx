import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { DollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";
import { TopBar } from "@/components/TopBar";
import { BudgetClient, type BudgetRow } from "./BudgetClient";

export const metadata = { title: "Budget — Rokki" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function BudgetPage({ params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const terminal = await resolveTerminalBySegment(supabase, ticker);
  if (!terminal) notFound();
  const t = terminal;

  const { data: items } = await supabase
    .from("budget_items")
    .select(
      "id, category, description, amount_cents, currency, status, incurred_on, vendor_id, created_at",
    )
    .eq("terminal_id", t.id)
    .order("incurred_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name")
    .eq("space_id", t.space_id)
    .order("name", { ascending: true });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-0">
      <TopBar>
        <Link href={`/p/${t.slug}`} className="text-text-3 hover:text-text-1">
          ← {t.name}
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Budget</span>
      </TopBar>
      <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-6">
        <header className="mb-4">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-text-0">
            <DollarSign className="h-5 w-5 text-accent" />
            Budget — {t.name}
          </h1>
          <p className="mt-1 text-xs text-text-3">
            Line items for this terminal. Costs roll up by status.
          </p>
        </header>
        <BudgetClient
          ticker={t.slug}
          initial={(items ?? []) as BudgetRow[]}
          vendors={
            (vendors ?? []) as Array<{ id: string; name: string }>
          }
        />
      </main>
    </div>
  );
}
