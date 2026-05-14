/**
 * Task queries scoped for the new module-system routes.
 *
 *   user      → tasks assigned to me + I delegated, across every terminal I see
 *   space     → every task in any terminal under this space
 *   terminal  → every task in this terminal (status != done)
 *
 * Reuses the same `tasks` table the existing UI already queries — no
 * new schema. RLS handles permission scoping.
 */
// `any` for the supabase client — matches the dashboard-queries
// pattern; ssr-cookie and plain supabase-js produce slightly
// different generic shapes here.
type Db = any; // eslint-disable-line

export interface ScopedTaskRow {
  id: string;
  title: string;
  status: string;
  priority: number | null;
  due_date: string | null;
  terminal_id: string;
  ticker_seq: number;
  ticker: string;
  terminal_name: string;
}

/**
 * Load every task in any terminal of the given space. Used by
 * `/s/[slug]/tasks`. Bounded to the most recent 200 open tasks to
 * keep the response shape predictable; the marketplace view at
 * /s/[slug]/settings would surface a "see all" link if needed.
 */
export async function loadTasksForSpace(
  supabase: Db,
  spaceId: string,
): Promise<ScopedTaskRow[]> {
  const { data: terminals } = await supabase
    .from("terminals")
    .select("id, ticker, name")
    .eq("space_id", spaceId)
    .is("archived_at", null);
  type Tx = { id: string; ticker: string; name: string };
  const tx = (terminals ?? []) as Tx[];
  if (tx.length === 0) return [];
  const tickerById = new Map(tx.map((t) => [t.id, t]));

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, terminal_id, ticker_seq")
    .in(
      "terminal_id",
      tx.map((t) => t.id),
    )
    .neq("status", "done")
    .order("priority", { ascending: true, nullsFirst: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(200);
  type TaskRow = {
    id: string;
    title: string;
    status: string;
    priority: number | null;
    due_date: string | null;
    terminal_id: string;
    ticker_seq: number;
  };
  return ((tasks ?? []) as TaskRow[]).map((t) => {
    const ref = tickerById.get(t.terminal_id);
    return {
      ...t,
      ticker: ref?.ticker ?? "",
      terminal_name: ref?.name ?? "Unknown terminal",
    };
  });
}

/**
 * Load tasks in a single terminal. Used by `/p/[ticker]/tasks`. Same
 * shape as the space view for code reuse.
 */
export async function loadTasksForTerminal(
  supabase: Db,
  terminalId: string,
): Promise<ScopedTaskRow[]> {
  const { data: terminal } = await supabase
    .from("terminals")
    .select("ticker, name")
    .eq("id", terminalId)
    .maybeSingle();
  type Tx = { ticker: string; name: string } | null;
  const tx = terminal as Tx;
  if (!tx) return [];

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, terminal_id, ticker_seq")
    .eq("terminal_id", terminalId)
    .neq("status", "done")
    .order("priority", { ascending: true, nullsFirst: false })
    .order("due_date", { ascending: true, nullsFirst: false });
  type TaskRow = {
    id: string;
    title: string;
    status: string;
    priority: number | null;
    due_date: string | null;
    terminal_id: string;
    ticker_seq: number;
  };
  return ((tasks ?? []) as TaskRow[]).map((t) => ({
    ...t,
    ticker: tx.ticker,
    terminal_name: tx.name,
  }));
}
