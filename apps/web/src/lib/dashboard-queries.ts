/**
 * Server-side dashboard queries. One call per card, parallelisable.
 * Used by the root page to render a complete dashboard in a single
 * round-trip so the user never sees a flash of empty cards.
 *
 * Client parameter is kept loosely typed because the ssr-cookie client
 * and plain supabase-js produce slightly different generic shapes; both
 * expose the same `.from()` API.
 */
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
  priority: number;
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
  const { data } = await supabase
    .from("space_members")
    .select("role, spaces!space_members_space_id_fkey(id, slug, name)")
    .eq("user_id", userId);
  type Row = {
    role: "owner" | "admin" | "member";
    spaces: { id: string; slug: string; name: string } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .filter((r): r is Row & { spaces: NonNullable<Row["spaces"]> } => !!r.spaces)
    .map((r) => ({
      id: r.spaces.id,
      slug: r.spaces.slug,
      name: r.spaces.name,
      role: r.role,
    }));
}

export async function loadDashTerminals(
  supabase: AnySupabaseClient,
): Promise<DashTerminal[]> {
  // RLS filters this to terminals the caller can see.
  const { data } = await supabase
    .from("terminals")
    .select("id, space_id, ticker, name, status, archived_at")
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  return (data ?? []) as DashTerminal[];
}

export async function loadAssignedTasks(
  supabase: AnySupabaseClient,
  userId: string,
): Promise<AssignedTask[]> {
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
      priority: number;
      due_date: string | null;
      terminal_id: string;
      ticker_seq: number;
    } | null;
  };
  const rows = ((data ?? []) as unknown as Row[])
    .map((r) => r.tasks)
    .filter((t): t is NonNullable<Row["tasks"]> => !!t)
    .filter((t) => t.status !== "done");
  return rows.sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.due_date ? new Date(a.due_date).getTime() : Infinity) -
        (b.due_date ? new Date(b.due_date).getTime() : Infinity),
  );
}

export async function loadDelegatedTasks(
  supabase: AnySupabaseClient,
  userId: string,
): Promise<DelegatedTask[]> {
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
    priority: number;
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
    ? await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", assigneeIds)
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
  userId: string,
): Promise<WeekItem[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  // Tasks assigned to me OR created by me that are due this week.
  const { data: assignedIds } = await supabase
    .from("task_assignees")
    .select("task_id")
    .eq("user_id", userId);
  const myAssignedIds = new Set(
    ((assignedIds ?? []) as { task_id: string }[]).map((r) => r.task_id),
  );

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, due_date, terminal_id, created_by")
    .gte("due_date", start.toISOString().slice(0, 10))
    .lte("due_date", end.toISOString().slice(0, 10))
    .neq("status", "done");

  type T = {
    id: string;
    title: string;
    due_date: string | null;
    terminal_id: string;
    created_by: string;
  };
  const mine = ((tasks ?? []) as T[]).filter(
    (t) => myAssignedIds.has(t.id) || t.created_by === userId,
  );

  const terminalIds = new Set(mine.map((t) => t.terminal_id));

  // External calendar events (RLS filters to our own connections).
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
  for (const e of eventRows) if (e.terminal_id) terminalIds.add(e.terminal_id);

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

  const taskItems: WeekItem[] = mine.map((t) => ({
    id: t.id,
    kind: "due" as const,
    title: t.title,
    when: t.due_date!,
    terminal_id: t.terminal_id,
    terminal_ticker: tickerById.get(t.terminal_id) ?? null,
  }));

  const eventItems: WeekItem[] = eventRows.map((e) => ({
    id: e.id,
    kind: "event" as const,
    title: e.title,
    when: e.starts_at,
    terminal_id: e.terminal_id,
    terminal_ticker: e.terminal_id
      ? (tickerById.get(e.terminal_id) ?? null)
      : null,
  }));

  return [...eventItems, ...taskItems];
}
