import { createClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { extractText } from "./extract.js";
import { buildChunks, type Chunk } from "./chunk.js";
import { embedBatch, embeddingsEnabled } from "./embedder.js";
import { getObjectBytes } from "./storage.js";
import {
  calendarSyncEnabled,
  scheduleCalendarSync,
  runCalendarSyncTick,
} from "./calendar-sync.js";
import { runScanTick } from "./scan-queue.js";
import { virusScanEnabled } from "./clamav.js";

/**
 * Rokki indexer.
 *
 * Poll loop:
 *   1. Find files with deleted_at IS NULL AND virus_scan_status IN
 *      ('clean','skipped') AND indexed_at IS NULL.
 *   2. For each (up to BATCH at a time): download bytes, extract text,
 *      chunk, (optionally) embed, insert file_chunks rows, set
 *      files.indexed_at.
 *   3. On failure: set files.index_error with the message so the operator
 *      can see it in the UI and won't re-process the file forever.
 *
 * Runs forever unless invoked with `--once`, in which case it drains the
 * queue once and exits (useful for tests / CI).
 */

const POLL_MS = Number(process.env.INDEXER_POLL_MS ?? 5_000);
const BATCH = Number(process.env.INDEXER_BATCH ?? 4);
const MAX_BYTES = Number(process.env.INDEXER_MAX_BYTES ?? 10 * 1024 * 1024); // 10 MB

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "[indexer] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  process.exit(1);
}

const admin = createClient<Database>(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

interface PendingFile {
  id: string;
  terminal_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  blob_key: string;
}

async function claimPending(limit: number): Promise<PendingFile[]> {
  const { data, error } = await admin
    .from("files")
    .select("id, terminal_id, filename, mime_type, size_bytes, blob_key")
    .is("indexed_at", null)
    .is("deleted_at", null)
    .in("virus_scan_status", ["clean", "skipped"])
    .order("uploaded_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[indexer] queue query failed:", error.message);
    return [];
  }
  return (data ?? []) as PendingFile[];
}

async function markDone(fileId: string, err?: string): Promise<void> {
  const patch = err
    ? { indexed_at: new Date().toISOString(), index_error: err }
    : { indexed_at: new Date().toISOString(), index_error: null };
  await admin.from("files").update(patch).eq("id", fileId);
}

function vectorLiteral(v: number[]): string {
  // pgvector accepts `[0.01,0.02,...]` as text input.
  return `[${v.map((n) => n.toFixed(6)).join(",")}]`;
}

async function indexFile(f: PendingFile): Promise<void> {
  const label = `${f.filename} [${f.id.slice(0, 8)}]`;
  if (f.size_bytes > MAX_BYTES) {
    console.warn(
      `[indexer] skip ${label}: ${f.size_bytes} bytes > ${MAX_BYTES}`,
    );
    await markDone(f.id, `file too large: ${f.size_bytes}`);
    return;
  }

  let bytes: Uint8Array;
  try {
    bytes = await getObjectBytes(f.blob_key);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[indexer] download failed ${label}: ${msg}`);
    await markDone(f.id, `download failed: ${msg}`);
    return;
  }

  const ex = await extractText(bytes, f.mime_type, f.filename);
  if (ex.kind === "unsupported") {
    console.log(`[indexer] skip ${label}: ${ex.reason}`);
    await markDone(f.id, `skipped: ${ex.reason}`);
    return;
  }

  const chunks: Chunk[] = buildChunks(ex);
  if (chunks.length === 0) {
    console.log(`[indexer] no chunks from ${label}`);
    await markDone(f.id, "skipped: no chunks produced");
    return;
  }

  // Remove any stale chunks for this file (shouldn't happen since we only
  // process when indexed_at is null, but defensive).
  await admin.from("file_chunks").delete().eq("file_id", f.id);

  // Embed (or not). The array's length matches chunks.length either way.
  const vectors = await embedBatch(chunks.map((c) => c.content));

  // Insert in reasonable batches.
  const BATCH_ROWS = 200;
  for (let off = 0; off < chunks.length; off += BATCH_ROWS) {
    const slice = chunks.slice(off, off + BATCH_ROWS);
    const sliceVecs = vectors.slice(off, off + BATCH_ROWS);
    const rows = slice.map((c, i) => ({
      file_id: f.id,
      terminal_id: f.terminal_id,
      chunk_index: c.index,
      content: c.content,
      tokens: c.tokens,
      page_number: c.pageNumber,
      embedding: sliceVecs[i] ? vectorLiteral(sliceVecs[i]!) : null,
    }));
    const { error } = await admin.from("file_chunks").insert(rows);
    if (error) {
      console.error(`[indexer] chunk insert failed ${label}: ${error.message}`);
      await markDone(f.id, `insert failed: ${error.message}`);
      return;
    }
  }

  const withEmbeds = vectors.filter((v) => v != null).length;
  console.log(
    `[indexer] ✓ ${label}: ${chunks.length} chunks${
      withEmbeds ? `, ${withEmbeds} embedded` : " (fts-only)"
    }`,
  );
  await markDone(f.id);
}

async function tick(): Promise<number> {
  const pending = await claimPending(BATCH);
  if (pending.length === 0) return 0;
  await Promise.all(pending.map((f) => indexFile(f)));
  return pending.length;
}

/**
 * One pass of the scan queue. Wrapped so callers can choose whether to
 * `await` it (batch mode) or fire-and-forget it alongside the indexer.
 */
async function scanTick(): Promise<number> {
  try {
    return await runScanTick(admin);
  } catch (e) {
    console.error("[indexer] scan tick failed:", e);
    return 0;
  }
}

async function main() {
  const once = process.argv.includes("--once");
  console.log(
    `[indexer] starting (embeddings: ${embeddingsEnabled() ? "OpenAI" : "disabled, fts fallback"}, clamav: ${virusScanEnabled() ? "on" : "off"}, calendar sync: ${calendarSyncEnabled() ? "on" : "off"})`,
  );
  if (once) {
    let total = 0;
    // Scan first so newly-uploaded files clear `pending` → `clean` and
    // become eligible for indexing inside this same `--once` run.
    while (true) {
      const n = await scanTick();
      if (n === 0) break;
    }
    while (true) {
      const n = await tick();
      total += n;
      if (n === 0) break;
    }
    if (calendarSyncEnabled()) {
      const cal = await runCalendarSyncTick();
      console.log(`[indexer] calendar: drained ${cal} connection(s)`);
    }
    console.log(`[indexer] drained ${total} file(s) and exiting`);
    process.exit(0);
  }

  await scanTick();
  await tick();
  setInterval(() => {
    tick().catch((e) => console.error("[indexer] tick failed:", e));
  }, POLL_MS);
  // Scan loop runs on its own cadence — roughly the same poll interval is
  // fine. We don't gate it on virusScanEnabled() because the loop itself
  // auto-skips pending files after a grace period when clamd isn't reachable.
  setInterval(() => {
    void scanTick();
  }, POLL_MS);

  // Independent schedule so a slow calendar provider doesn't starve the
  // file indexer.
  if (calendarSyncEnabled()) scheduleCalendarSync(false);
}

main().catch((e) => {
  console.error("[indexer] fatal:", e);
  process.exit(1);
});
