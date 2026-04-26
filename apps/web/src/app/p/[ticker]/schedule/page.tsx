import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { ScheduleClient, type PhaseRow } from "./ScheduleClient";

export const metadata = { title: "Schedule — Rokki" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function SchedulePage({ params }: Props) {
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

  const { data: phases } = await supabase
    .from("schedule_phases")
    .select(
      "id, title, start_date, end_date, color, depends_on, position, created_at",
    )
    .eq("terminal_id", t.id)
    .order("start_date", { ascending: true })
    .order("position", { ascending: true });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-0">
      <TopBar>
        <Link href={`/p/${t.ticker}`} className="text-text-3 hover:text-text-1">
          ← {t.name}
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Schedule</span>
      </TopBar>
      <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto p-6">
        <header className="mb-4">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-text-0">
            <Calendar className="h-5 w-5 text-accent" />
            Schedule — {t.ticker}
          </h1>
          <p className="mt-1 text-xs text-text-3">
            Gantt-style phases for this terminal. Scroll horizontally to pan.
          </p>
        </header>
        <ScheduleClient
          ticker={t.ticker}
          initial={(phases ?? []) as PhaseRow[]}
        />
      </main>
    </div>
  );
}
