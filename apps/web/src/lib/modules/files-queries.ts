/**
 * Files module queries — read-only MVP for Phase 1.
 *
 * Pulls from the existing `files` table (already populated by the
 * upload flows in `/p/[ticker]`). No new schema; the standalone
 * Files module just provides a different lens onto the same data
 * at space and terminal scope.
 *
 * Upload UI + Azure-Blob writes stay in the existing per-terminal
 * page for v1 — the new module surface is read-only until Phase
 * 3's marketplace + per-module config lands.
 */
type Db = any; // eslint-disable-line

export interface ScopedFileRow {
  id: string;
  filename: string;
  folder: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  terminal_id: string;
  terminal_ticker: string;
  terminal_name: string;
}

/**
 * Files across every terminal under this space. Soft-deleted rows
 * excluded. Sorted newest-first, capped at 200 for predictability.
 */
export async function loadFilesForSpace(
  supabase: Db,
  spaceId: string,
): Promise<ScopedFileRow[]> {
  const { data: terminals } = await supabase
    .from("terminals")
    .select("id, ticker, name")
    .eq("space_id", spaceId)
    .is("archived_at", null);
  type Tx = { id: string; ticker: string; name: string };
  const tx = (terminals ?? []) as Tx[];
  if (tx.length === 0) return [];
  const ref = new Map(tx.map((t) => [t.id, t]));

  const { data: files } = await supabase
    .from("files")
    .select(
      "id, filename, folder, mime_type, size_bytes, uploaded_at, terminal_id",
    )
    .in(
      "terminal_id",
      tx.map((t) => t.id),
    )
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(200);
  type FileRow = {
    id: string;
    filename: string;
    folder: string;
    mime_type: string;
    size_bytes: number;
    uploaded_at: string;
    terminal_id: string;
  };
  return ((files ?? []) as FileRow[]).map((f) => {
    const r = ref.get(f.terminal_id);
    return {
      ...f,
      terminal_ticker: r?.ticker ?? "",
      terminal_name: r?.name ?? "Unknown terminal",
    };
  });
}

/**
 * Files in a single terminal. Mirror of the space query.
 */
export async function loadFilesForTerminal(
  supabase: Db,
  terminalId: string,
): Promise<ScopedFileRow[]> {
  const { data: terminal } = await supabase
    .from("terminals")
    .select("ticker, name")
    .eq("id", terminalId)
    .maybeSingle();
  type Tx = { ticker: string; name: string } | null;
  const tx = terminal as Tx;
  if (!tx) return [];

  const { data: files } = await supabase
    .from("files")
    .select(
      "id, filename, folder, mime_type, size_bytes, uploaded_at, terminal_id",
    )
    .eq("terminal_id", terminalId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });
  type FileRow = {
    id: string;
    filename: string;
    folder: string;
    mime_type: string;
    size_bytes: number;
    uploaded_at: string;
    terminal_id: string;
  };
  return ((files ?? []) as FileRow[]).map((f) => ({
    ...f,
    terminal_ticker: tx.ticker,
    terminal_name: tx.name,
  }));
}

/**
 * Human-friendly size — KB, MB, GB to one decimal.
 * Pulled into the query lib so the same formatter is used at both
 * the list view and the row-level chip.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
