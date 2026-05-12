/**
 * Calendar data layer.
 *
 * Two source types merge into a single `CalendarItem` stream that
 * the UI groups by day:
 *
 *   - `event`: a row from `calendar_events` (synced from Google /
 *     Microsoft). Tied to a `calendar_connections` id, which the
 *     source filter exposes as a per-account toggle.
 *   - `due`: a Rokki task with a `due_date`. Tied to the synthetic
 *     "tasks" source id, which the filter exposes as a single
 *     "Rokki tasks" toggle.
 *
 * The view (`today` / `week` / `month`) drives the date range we
 * scan; the source filter prunes rows after the fetch. The DB
 * indexes already cover scanning by `(connection_id, starts_at)`
 * and `(user_id, due_date)` so the cost is whatever range the
 * view asks for.
 */
import { traceSpan } from "./observability";

type AnySupabaseClient = any;

export type CalendarView = "today" | "week" | "month";

export type CalendarItemKind = "event" | "due";

export interface CalendarItem {
  id: string;
  kind: CalendarItemKind;
  title: string;
  /** ISO datetime — events have a real time; due-date rows use noon local. */
  when: string;
  /** Full date YYYY-MM-DD — used for day-bucket grouping. */
  date: string;
  all_day: boolean;
  /** Source id — either a `calendar_connections.id` or the "tasks" sentinel. */
  source_id: string;
  /** Optional terminal_id (events with `terminal_id` set, all tasks). */
  terminal_id: string | null;
  /** Optional terminal ticker — for deep links from the task path. */
  terminal_ticker: string | null;
  /** Task only — for the detail link. */
  ticker_seq?: number;
}

export interface CalendarSource {
  /** Either a `calendar_connections.id` or the literal "tasks". */
  id: string;
  /** Display label — the email address for a connection, "Rokki tasks" for the synthetic. */
  label: string;
  /** Disambiguator for icon + chip color. */
  kind: "connection" | "tasks";
  /** Only set when `kind === "connection"`. */
  provider?: "google" | "microsoft";
}

interface LoadOpts {
  view: CalendarView;
  /** YYYY-MM-DD anchoring the view's range. */
  refDate: string;
  /** Source ids to EXCLUDE from the response. */
  hiddenSources: Set<string>;
}

/**
 * Load calendar items for the requested view. Server-side scan,
 * RLS-scoped — connection events for the viewer's own connections
 * only, due-date tasks for terminals they can see.
 */
export async function loadCalendarItems(
  supabase: AnySupabaseClient,
  userId: string,
  opts: LoadOpts,
): Promise<CalendarItem[]> {
  return traceSpan(
    {
      name: "db.calendar.items",
      op: "db.query",
      attributes: { view: opts.view, ref: opts.refDate },
    },
    async () => {
      const range = rangeForView(opts.view, opts.refDate);

      const skipTasks = opts.hiddenSources.has("tasks");
      const [eventsResult, dueResult] = await Promise.all([
        fetchEvents(supabase, userId, range, opts.hiddenSources),
        skipTasks ? Promise.resolve([] as CalendarItem[]) : fetchDueTasks(
          supabase,
          userId,
          range,
        ),
      ]);

      const all = [...eventsResult, ...dueResult].sort((a, b) =>
        a.when.localeCompare(b.when),
      );
      return all;
    },
  );
}

interface Range {
  startIso: string;
  endIso: string;
  startDate: string;
  endDate: string;
}

/**
 * View → DB range:
 *   today  → [refDate, refDate+1)        (single day, exclusive end)
 *   week   → [refDate, refDate+7)        (7 days from anchor)
 *   month  → [first-of-month, +1 month)  (whole calendar month)
 *
 * Range is half-open: `>= start` and `< end`. All date math uses
 * the `new Date(y, m-1, d)` local constructor so the anchor lines
 * up with the user's local calendar rather than UTC.
 */
function rangeForView(view: CalendarView, refDate: string): Range {
  const [y, m, d] = refDate.split("-").map(Number);
  const ref = new Date(y, (m ?? 1) - 1, d ?? 1);
  ref.setHours(0, 0, 0, 0);
  const start = new Date(ref);
  const end = new Date(ref);
  if (view === "today") {
    end.setDate(end.getDate() + 1);
  } else if (view === "week") {
    end.setDate(end.getDate() + 7);
  } else {
    start.setDate(1);
    end.setDate(1);
    end.setMonth(end.getMonth() + 1);
  }
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: new Date(end.getTime() - 1).toISOString().slice(0, 10),
  };
}

async function fetchEvents(
  supabase: AnySupabaseClient,
  userId: string,
  range: Range,
  hidden: Set<string>,
): Promise<CalendarItem[]> {
  // Two-stage: load the user's connections first, then events for
  // each. Could be a single join, but the explicit two-step lets us
  // skip the events fetch entirely when every connection is hidden.
  const { data: connRows } = await supabase
    .from("calendar_connections")
    .select("id")
    .eq("user_id", userId)
    .is("revoked_at", null);
  type ConnRow = { id: string };
  const visibleConnIds = ((connRows ?? []) as ConnRow[])
    .map((c) => c.id)
    .filter((id) => !hidden.has(id));
  if (visibleConnIds.length === 0) return [];

  const { data: rows } = await supabase
    .from("calendar_events")
    .select(
      "id, connection_id, title, starts_at, all_day, terminal_id, terminals(ticker)",
    )
    .in("connection_id", visibleConnIds)
    .gte("starts_at", range.startIso)
    .lt("starts_at", range.endIso)
    .is("deleted_at", null)
    .order("starts_at", { ascending: true });
  type EventRow = {
    id: string;
    connection_id: string;
    title: string;
    starts_at: string;
    all_day: boolean;
    terminal_id: string | null;
    terminals:
      | { ticker: string }
      | { ticker: string }[]
      | null;
  };
  return ((rows ?? []) as EventRow[]).map((r) => ({
    id: r.id,
    kind: "event",
    title: r.title,
    when: r.starts_at,
    date: r.starts_at.slice(0, 10),
    all_day: r.all_day,
    source_id: r.connection_id,
    terminal_id: r.terminal_id,
    terminal_ticker: extractTicker(r.terminals),
    ticker_seq: undefined,
  }));
}

async function fetchDueTasks(
  supabase: AnySupabaseClient,
  userId: string,
  range: Range,
): Promise<CalendarItem[]> {
  // Only tasks assigned to the viewer — matches the dashboard's
  // "your week" semantics. Could expand to "tasks I delegated"
  // later as a separate source.
  const { data: rows } = await supabase
    .from("task_assignees")
    .select(
      "tasks!task_assignees_task_id_fkey(id, title, due_date, ticker_seq, terminal_id, terminals(ticker))",
    )
    .eq("user_id", userId);
  type AssignedRow = {
    tasks: {
      id: string;
      title: string;
      due_date: string | null;
      ticker_seq: number;
      terminal_id: string;
      terminals:
        | { ticker: string }
        | { ticker: string }[]
        | null;
    } | null;
  };
  return ((rows ?? []) as AssignedRow[])
    .map((r) => r.tasks)
    .filter(
      (t): t is NonNullable<AssignedRow["tasks"]> =>
        !!t && !!t.due_date && t.due_date >= range.startDate && t.due_date <= range.endDate,
    )
    .map((t) => ({
      id: t.id,
      kind: "due" as const,
      title: t.title,
      // Tasks-as-due have no real time-of-day. Use 12:00 local so
      // they group with the day cleanly regardless of UTC offset.
      when: `${t.due_date}T12:00:00`,
      date: t.due_date as string,
      all_day: true,
      source_id: "tasks",
      terminal_id: t.terminal_id,
      terminal_ticker: extractTicker(t.terminals),
      ticker_seq: t.ticker_seq,
    }));
}

function extractTicker(
  rel: { ticker: string } | { ticker: string }[] | null,
): string | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0]?.ticker ?? null;
  return rel.ticker ?? null;
}
