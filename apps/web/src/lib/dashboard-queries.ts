/**
 * Server-side dashboard queries. One call per card, parallelisable.
 * Used by the root page to render a complete dashboard in a single
 * round-trip so the user never sees a flash of empty cards.
 *
 * Each loader is wrapped in a Sentry span so the dashboard render
 * appears in the trace waterfall as N parallel `db.dashboard.*` spans
 * under the page transaction. See docs/13_OBSERVABILITY.md.
 *
 * Client parameter is kept loosely typed because the ssr-cookie client
 * and plain supabase-js produce slightly different generic shapes; both
 * expose the same `.from()` API.
 */
import { traceSpan } from "./observability";

type AnySupabaseClient = any;

export interface DashSpace {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "admin" | "member";
}

export interface DashTerminal {
  id: string;
  space_id: string;
  /**
   * URL-friendly identifier (lowercase, dashed). The /p/<slug> route
   * resolves by this. Stable across renames so old links never break.
   * Backfilled from the terminal's name via the rokki_slugify SQL
   * helper; see the 20260526010000_terminal_slug migration.
   */
  slug: string;
  /**
   * Legacy Bloomberg-style ticker (uppercase, e.g. "FFRDBL"). Still
   * stored so old /p/FFRDBL URLs keep resolving via fallback lookup,
   * but no longer rendered anywhere in the UI.
   */
  ticker: string;
  name: string;
  status: string;
  archived_at: string | null;
}

export interface AssignedTask {
  id: string;
  title: string;
  status: string;
  /** 1=High, 2=Medium, 3=Low, null=No priority. */
  priority: number | null;
  due_date: string | null;
  terminal_id: string;
  ticker_seq: number;
  /** "Highest priority of the day" star — rendered by the shared TaskRow. */
  starred: boolean;
}

export interface DelegatedTask extends AssignedTask {
  assignees: Array<{ user_id: string; full_name: string | null }>;
}

export interface WeekItem {
  id: string;
  kind: "event" | "due";
  title: string;
  when: string; // ISO date (full datetime for event, date-only for due)
  terminal_id: string | null;
  /**
   * URL-friendly terminal identifier. Used for `/p/<slug>` links from
   * Week-card rows. Null when the item isn't tied to a terminal (e.g.
   * raw calendar events with no terminal_id).
   */
  terminal_slug: string | null;
  terminal_ticker: string | null;
  /**
   * Source-id for the source filter chip in the Week card. Either a
   * `calendar_connections.id` (events) or null (no source — shouldn't
   * happen for current data but typed permissively).
   */
  source_id: string | null;
}

/**
 * Calendar source the user can show/hide in the Week card. Mirrors
 * the shape used by the full /calendar page so the dashboard's
 * source filter reads identically.
 */
export interface WeekSource {
  /** `calendar_connections.id`. */
  id: string;
  /** Display label — the connected account email. */
  label: string;
  provider: "google" | "microsoft";
}

/** Allowed time-window values for the Week card. */
export type WeekRange = "today" | "week" | "month";

export async function loadDashSpaces(
  supabase: AnySupabaseClient,
  userId: string,
): Promise<DashSpace[]> {
  return traceSpan(
    { name: "db.dashboard.spaces", op: "db.query", attributes: { table: "space_members" } },
    async () => {
      // Pull archived_at so we can filter soft-deleted spaces out of
      // the explorer. DELETE /api/v1/orgs/:slug sets archived_at
      // (cascade trigger fans the archive to terminals/tasks/files);
      // without this filter the deleted space lingered in the rail
      // until the user's session expired — that was Zack's "I deleted
      // Goodwin Proctor and it's still showing" report.
      const { data } = await supabase
        .from("space_members")
        .select(
          "role, spaces!space_members_space_id_fkey(id, slug, name, archived_at)",
        )
        .eq("user_id", userId);
      type Row = {
        role: "owner" | "admin" | "member";
        spaces: {
          id: string;
          slug: string;
          name: string;
          archived_at: string | null;
        } | null;
      };
      return ((data ?? []) as unknown as Row[])
        .filter(
          (r): r is Row & { spaces: NonNullable<Row["spaces"]> } => !!r.spaces,
        )
        .filter((r) => r.spaces.archived_at === null)
        .map((r) => ({
          id: r.spaces.id,
          slug: r.spaces.slug,
          name: r.spaces.name,
          role: r.role,
        }));
    },
  );
}

export async function loadDashTerminals(
  supabase: AnySupabaseClient,
): Promise<DashTerminal[]> {
  return traceSpan(
    { name: "db.dashboard.terminals", op: "db.query", attributes: { table: "terminals" } },
    async () => {
      // RLS filters this to terminals the caller can see.
      const { data } = await supabase
        .from("terminals")
        .select("id, space_id, slug, ticker, name, status, archived_at")
        .is("archived_at", null)
        .order("updated_at", { ascending: false });
      return (data ?? []) as DashTerminal[];
    },
  );
}

export async function loadAssignedTasks(
  supabase: AnySupabaseClient,
  userId: string,
): Promise<AssignedTask[]> {
  return traceSpan(
    { name: "db.dashboard.assigned_tasks", op: "db.query", attributes: { table: "task_assignees" } },
    async () => {
      const { data } = await supabase
        .from("task_assignees")
        .select(
          "tasks!task_assignees_task_id_fkey(id, title, status, priority, due_date, terminal_id, ticker_seq, starred)",
        )
        .eq("user_id", userId);
      type Row = {
        tasks: {
          id: string;
          title: string;
          status: string;
          priority: number | null;
          due_date: string | null;
          terminal_id: string;
          ticker_seq: number;
          starred: boolean;
        } | null;
      };
      const rows = ((data ?? []) as unknown as Row[])
        .map((r) => r.tasks)
        .filter((t): t is NonNullable<Row["tasks"]> => !!t)
        .filter((t) => t.status !== "done");
      // Sort: priority asc with NULL = "no priority" sinking to the
      // bottom, then due_date asc. Matches the server ORDER BY
      // semantics with NULLS LAST.
      const pkey = (p: number | null): number =>
        p == null ? Number.POSITIVE_INFINITY : p;
      return rows.sort(
        (a, b) =>
          pkey(a.priority) - pkey(b.priority) ||
          (a.due_date ? new Date(a.due_date).getTime() : Infinity) -
            (b.due_date ? new Date(b.due_date).getTime() : Infinity),
      );
    },
  );
}

export async function loadDelegatedTasks(
  supabase: AnySupabaseClient,
  userId: string,
): Promise<DelegatedTask[]> {
  return traceSpan(
    { name: "db.dashboard.delegated_tasks", op: "db.query", attributes: { table: "tasks" } },
    async () => {
      // Tasks this user created that are assigned to *someone other than* them.
      const { data } = await supabase
        .from("tasks")
        .select(
          "id, title, status, priority, due_date, terminal_id, ticker_seq, starred, task_assignees!task_assignees_task_id_fkey(user_id)",
        )
        .eq("created_by", userId)
        .neq("status", "done");
      type Row = {
        id: string;
        title: string;
        status: string;
        priority: number | null;
        due_date: string | null;
        terminal_id: string;
        ticker_seq: number;
        starred: boolean;
        task_assignees: { user_id: string }[] | null;
      };
      const rows = ((data ?? []) as unknown as Row[]).filter(
        (r) =>
          (r.task_assignees ?? []).length > 0 &&
          r.task_assignees!.some((a) => a.user_id !== userId),
      );

      // Resolve assignee names in a second pass so we don't blow up the select.
      const assigneeIds = Array.from(
        new Set(
          rows.flatMap((r) => (r.task_assignees ?? []).map((a) => a.user_id)),
        ),
      ).filter((id) => id !== userId);
      const { data: profiles } = assigneeIds.length
        ? await traceSpan(
            {
              name: "db.dashboard.delegated_tasks.profiles",
              op: "db.query",
              attributes: { table: "profiles", n_ids: assigneeIds.length },
            },
            async () =>
              await supabase
                .from("profiles")
                .select("user_id, full_name")
                .in("user_id", assigneeIds),
          )
        : { data: [] };
      type P = { user_id: string; full_name: string | null };
      const nameById = new Map(
        ((profiles ?? []) as P[]).map((p) => [p.user_id, p.full_name]),
      );

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        priority: r.priority,
        due_date: r.due_date,
        terminal_id: r.terminal_id,
        ticker_seq: r.ticker_seq,
        starred: r.starred,
        assignees: (r.task_assignees ?? [])
          .filter((a) => a.user_id !== userId)
          .map((a) => ({
            user_id: a.user_id,
            full_name: nameById.get(a.user_id) ?? null,
          })),
      }));
    },
  );
}

/**
 * Compute the date window for the Week card based on the user's
 * range selection. Half-open: `[start, end)`.
 *
 *   today → midnight today → midnight tomorrow
 *   week  → midnight today → +7 days
 *   month → midnight today → +30 days
 */
function rangeWindow(range: WeekRange): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (range === "today") end.setDate(end.getDate() + 1);
  else if (range === "week") end.setDate(end.getDate() + 7);
  else end.setDate(end.getDate() + 30);
  return { start, end };
}

/**
 * Produce the "This Week" list:
 *   - external calendar events synced from the user's connected providers
 *
 * Each row is decorated with a terminal ticker when we can infer one. The
 * list is sorted by `when` in the UI; this function just returns the union.
 *
 * Filters applied at the DB level (each a single indexed predicate):
 *   - `scopeTerminalId`: narrow to one terminal's events
 *   - `range`: "today" | "week" | "month" controls the date window
 *   - `hiddenSourceIds`: list of `calendar_connections.id` to EXCLUDE
 */
export async function loadWeekItems(
  supabase: AnySupabaseClient,
  // userId stays in the signature for back-compat with the dashboard
  // page; the implementation no longer needs it because tasks are
  // intentionally excluded from the calendar view (they have their
  // own dedicated Tasks card already, which surfaces the same due
  // dates with richer context).
  _userId: string,
  scopeTerminalId?: string | null,
  range: WeekRange = "week",
  hiddenSourceIds: string[] = [],
): Promise<WeekItem[]> {
  return traceSpan(
    {
      name: "db.dashboard.week_items",
      op: "db.query",
      attributes: {
        range,
        ...(scopeTerminalId ? { scope: scopeTerminalId } : {}),
        ...(hiddenSourceIds.length
          ? { hidden_sources: hiddenSourceIds.length }
          : {}),
      },
    },
    async () => {
      const { start, end } = rangeWindow(range);

      // External calendar events only — tasks were dropped from this
      // view per UX feedback ("Due dates for tasks are showing up in
      // the calendar. Not necessary."). Tasks live in the Tasks card
      // where their due dates are surfaced more usefully.
      let eventsQuery = supabase
        .from("calendar_events")
        .select("id, title, starts_at, terminal_id, connection_id")
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .is("deleted_at", null);
      if (scopeTerminalId) {
        eventsQuery = eventsQuery.eq("terminal_id", scopeTerminalId);
      }
      const { data: events } = await eventsQuery;
      type E = {
        id: string;
        title: string;
        starts_at: string;
        terminal_id: string | null;
        connection_id: string | null;
      };
      // Post-filter hidden sources. Cheaper than a `not.in(...)` PostgREST
      // filter for small N and avoids the URL-length cap on long lists.
      const hidden = new Set(hiddenSourceIds);
      const eventRows = ((events ?? []) as E[]).filter(
        (e) => !e.connection_id || !hidden.has(e.connection_id),
      );
      const terminalIds = new Set(
        eventRows
          .map((e) => e.terminal_id)
          .filter((id): id is string => id !== null),
      );

      const { data: terminals } = terminalIds.size
        ? await supabase
            .from("terminals")
            .select("id, slug, ticker")
            .in("id", Array.from(terminalIds))
        : { data: [] };
      type Tx = { id: string; slug: string; ticker: string };
      const slugById = new Map(
        ((terminals ?? []) as Tx[]).map((t) => [t.id, t.slug]),
      );
      const tickerById = new Map(
        ((terminals ?? []) as Tx[]).map((t) => [t.id, t.ticker]),
      );

      return eventRows.map<WeekItem>((e) => ({
        id: e.id,
        kind: "event" as const,
        title: e.title,
        when: e.starts_at,
        terminal_id: e.terminal_id,
        terminal_slug: e.terminal_id
          ? (slugById.get(e.terminal_id) ?? null)
          : null,
        terminal_ticker: e.terminal_id
          ? (tickerById.get(e.terminal_id) ?? null)
          : null,
        source_id: e.connection_id,
      }));
    },
  );
}

/**
 * Load the viewer's calendar source list — used to render the source
 * filter chips on the Week card. Returns one row per non-revoked
 * connection (the same shape /calendar uses). Empty list means the
 * filter button hides itself.
 */
export async function loadWeekSources(
  supabase: AnySupabaseClient,
  userId: string,
): Promise<WeekSource[]> {
  return traceSpan(
    {
      name: "db.dashboard.week_sources",
      op: "db.query",
      attributes: { table: "calendar_connections" },
    },
    async () => {
      const { data } = await supabase
        .from("calendar_connections")
        .select("id, provider, account_email")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .order("provider", { ascending: true })
        .order("account_email", { ascending: true });
      type Row = {
        id: string;
        provider: "google" | "microsoft";
        account_email: string;
      };
      return ((data ?? []) as Row[]).map((r) => ({
        id: r.id,
        label: r.account_email,
        provider: r.provider,
      }));
    },
  );
}
