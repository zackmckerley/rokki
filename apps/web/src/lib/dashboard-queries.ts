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
  terminal_ticker: string | null;
}

export async function loadDashSpaces(
  supabase: AnySupabaseClient,
  userId: string,
): Promise<DashSpace[]> {
  return traceSpan(
    { name: "db.dashboard.spaces", op: "db.query", attributes: { table: "space_members" } },
    async () => {
      const { data } = await supabase
        .from("space_members")
        .select("role, spaces!space_members_space_id_fkey(id, slug, name)")
        .eq("user_id", userId);
      type Row = {
        role: "owner" | "admin" | "member";
        spaces: { id: string; slug: string; name: string } | null;
      };
      return ((data ?? []) as unknown as Row[])
        .filter(
          (r): r is Row & { spaces: NonNullable<Row["spaces"]> } => !!r.spaces,
        )
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
        .select("id, space_id, ticker, name, status, archived_at")
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
          "tasks!task_assignees_task_id_fkey(id, title, status, priority, due_date, terminal_id, ticker_seq)",
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
          "id, title, status, priority, due_date, terminal_id, ticker_seq, task_assignees!task_assignees_task_id_fkey(user_id)",
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
 * Produce the "This Week" list:
 *   - Rokki tasks with a due_date between today and 7 days out
 *   - external calendar events synced from the user's connected providers
 *
 * Each row is decorated with a terminal ticker when we can infer one. The
 * list is sorted by `when` in the UI; this function just returns the union.
 */
export async function loadWeekItems(
  supabase: AnySupabaseClient,
  // userId stays in the signature for back-compat with the dashboard
  // page; the implementation no longer needs it because tasks are
  // intentionally excluded from the calendar view (they have their
  // own dedicated Tasks card already, which surfaces the same due
  // dates with richer context).
  _userId: string,
): Promise<WeekItem[]> {
  return traceSpan(
    { name: "db.dashboard.week_items", op: "db.query" },
    async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      // External calendar events only — tasks were dropped from this
      // view per UX feedback ("Due dates for tasks are showing up in
      // the calendar. Not necessary."). Tasks live in the Tasks card
      // where their due dates are surfaced more usefully.
      const { data: events } = await supabase
        .from("calendar_events")
        .select("id, title, starts_at, terminal_id")
        .gte("starts_at", start.toISOString())
        .lte("starts_at", end.toISOString())
        .is("deleted_at", null);
      type E = {
        id: string;
        title: string;
        starts_at: string;
        terminal_id: string | null;
      };
      const eventRows = (events ?? []) as E[];
      const terminalIds = new Set(
        eventRows
          .map((e) => e.terminal_id)
          .filter((id): id is string => id !== null),
      );

      const { data: terminals } = terminalIds.size
        ? await supabase
            .from("terminals")
            .select("id, ticker")
            .in("id", Array.from(terminalIds))
        : { data: [] };
      type Tx = { id: string; ticker: string };
      const tickerById = new Map(
        ((terminals ?? []) as Tx[]).map((t) => [t.id, t.ticker]),
      );

      return eventRows.map<WeekItem>((e) => ({
        id: e.id,
        kind: "event" as const,
        title: e.title,
        when: e.starts_at,
        terminal_id: e.terminal_id,
        terminal_ticker: e.terminal_id
          ? (tickerById.get(e.terminal_id) ?? null)
          : null,
      }));
    },
  );
}
