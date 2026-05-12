import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { CalendarClient } from "@/components/calendar/CalendarClient";
import {
  loadCalendarItems,
  type CalendarSource,
  type CalendarView,
} from "@/lib/calendar-queries";

interface Props {
  searchParams: Promise<{
    view?: string;
    date?: string;
    sources?: string;
  }>;
}

/**
 * Calendar page — supports three views (today / week / month) plus
 * a source filter that lets the user hide / show specific synced
 * calendars (Google work, Outlook personal, etc.) or Rokki task
 * due-dates.
 *
 * State is URL-driven (`?view=`, `?date=`, `?sources=`) so deep
 * links work and the browser back button traverses view history
 * naturally. The client component takes those values and renders
 * the appropriate grid; switching views does a soft navigation
 * that re-runs this loader.
 */
export default async function CalendarPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const view: CalendarView =
    params.view === "today" || params.view === "month"
      ? (params.view as CalendarView)
      : "week";

  // Reference date — defaults to today. Used as the "anchor" for the
  // current view (Today renders this single day, Week renders the
  // 7 days starting here, Month renders the calendar month
  // containing this date). YYYY-MM-DD only — TZ-stable.
  const refDate = parseDateOrToday(params.date);

  // Hidden source ids — passed through as a comma-separated list of
  // either calendar_connections.id OR the literal "tasks" sentinel
  // for the Rokki tasks pseudo-source.
  const hiddenSources = new Set(
    (params.sources ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // Fetch every connection the viewer has so the filter chips can
  // render even before any sync has run. Sorted by provider then
  // email so the chip order is stable across loads.
  const { data: connectionRows } = await supabase
    .from("calendar_connections")
    .select("id, provider, account_email")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("provider", { ascending: true })
    .order("account_email", { ascending: true });

  type ConnectionRow = {
    id: string;
    provider: "google" | "microsoft";
    account_email: string;
  };
  const connections = (connectionRows ?? []) as ConnectionRow[];

  // Sources: one per connection + a fixed "Rokki tasks" pseudo-row
  // so the user can hide due-date markers independently from synced
  // events.
  const sources: CalendarSource[] = [
    { id: "tasks", label: "Rokki tasks", kind: "tasks" },
    ...connections.map<CalendarSource>((c) => ({
      id: c.id,
      label: c.account_email,
      kind: "connection",
      provider: c.provider,
    })),
  ];

  const items = await loadCalendarItems(supabase, user.id, {
    view,
    refDate,
    hiddenSources,
  });

  return (
    <div className="flex min-h-screen flex-col bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          ← Dashboard
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Calendar</span>
      </TopBar>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">
        <CalendarClient
          view={view}
          refDate={refDate}
          sources={sources}
          hiddenSourceIds={Array.from(hiddenSources)}
          items={items}
        />
      </main>
    </div>
  );
}

/** Validate / coerce a YYYY-MM-DD string. */
function parseDateOrToday(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
