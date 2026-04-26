import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { PermitsClient, type PermitRow } from "./PermitsClient";

export const metadata = { title: "Permits — Rokki" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function PermitsPage({ params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: terminal } = await supabase
    .from("terminals")
    .select("id, ticker, name")
    .eq("ticker", ticker.toUpperCase())
    .is("archived_at", null)
    .maybeSingle();
  if (!terminal) notFound();
  const t = terminal as { id: string; ticker: string; name: string };

  const { data: permits } = await supabase
    .from("permits")
    .select(
      "id, number, kind, authority, status, applied_on, issued_on, expires_on, notes, created_at",
    )
    .eq("terminal_id", t.id)
    .order("expires_on", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-0">
      <TopBar>
        <Link href={`/p/${t.ticker}`} className="text-text-3 hover:text-text-1">
          ← {t.name}
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Permits</span>
      </TopBar>
      <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-6">
        <header className="mb-4">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-text-0">
            <FileCheck2 className="h-5 w-5 text-accent" />
            Permits — {t.ticker}
          </h1>
          <p className="mt-1 text-xs text-text-3">
            Permits tracked against this terminal. Rows ordered by next
            expiration date.
          </p>
        </header>
        <PermitsClient ticker={t.ticker} initial={(permits ?? []) as PermitRow[]} />
      </main>
    </div>
  );
}
