/**
 * Messenger module queries.
 *
 * The existing `messages` + `message_threads` schema already powers
 * the per-space and per-terminal chat threads — see migration
 * 20260424010000_messages.sql and 20260424030000_space_channels.sql.
 *
 * For the module routes we just need a thin layer that returns
 * "threads visible to this scope" so the list view can render.
 */
type Db = any; // eslint-disable-line

export interface ScopedThreadRow {
  id: string;
  kind: string;
  last_message_at: string | null;
  unread: number;
}

/**
 * Threads attached to a space (channels + space-scope DMs). Pulled
 * via the existing `message_threads.space_id` foreign key.
 */
export async function loadThreadsForSpace(
  supabase: Db,
  spaceId: string,
): Promise<ScopedThreadRow[]> {
  const { data } = await supabase
    .from("message_threads")
    .select("id, kind, last_message_at")
    .eq("space_id", spaceId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);
  type Row = {
    id: string;
    kind: string;
    last_message_at: string | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    unread: 0, // populated by the messenger UI separately
  }));
}

/**
 * The single per-terminal thread. By convention every terminal has
 * at most one `kind='terminal'` thread; we surface it as the entry
 * point for the terminal-scope Messenger module.
 */
export async function loadThreadForTerminal(
  supabase: Db,
  terminalId: string,
): Promise<ScopedThreadRow | null> {
  const { data } = await supabase
    .from("message_threads")
    .select("id, kind, last_message_at")
    .eq("terminal_id", terminalId)
    .eq("kind", "terminal")
    .maybeSingle();
  type Row = {
    id: string;
    kind: string;
    last_message_at: string | null;
  } | null;
  const row = data as Row;
  if (!row) return null;
  return { ...row, unread: 0 };
}
