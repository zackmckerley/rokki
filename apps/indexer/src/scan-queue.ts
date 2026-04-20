import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { getObjectBytes } from "./storage.js";
import { scanBytes, virusScanEnabled } from "./clamav.js";

/**
 * Virus-scan loop. Runs alongside the file indexer in the same process —
 * it's I/O-bound and the two don't contend.
 *
 *   1. Claim up to BATCH files with `virus_scan_status = 'pending'`.
 *   2. If ClamAV isn't configured OR the file was uploaded > GRACE ago,
 *      mark `skipped` so the indexer can move on.
 *   3. Otherwise: stream bytes to clamd, set `clean` or `infected`.
 *
 * Files stuck at `infected` are left in place (not auto-deleted) so the
 * platform admin can audit. Downloads for infected files return 403 in
 * the download route.
 */

const BATCH = Number(process.env.SCAN_BATCH ?? 2);
const MAX_BYTES = Number(process.env.SCAN_MAX_BYTES ?? 200 * 1024 * 1024); // 200 MB hard cap
const GRACE_MS = Number(process.env.SCAN_GRACE_MS ?? 10 * 60 * 1000); // 10 min

interface PendingFile {
  id: string;
  terminal_id: string;
  filename: string;
  size_bytes: number;
  blob_key: string;
  uploaded_at: string;
}

export async function runScanTick(
  admin: SupabaseClient<Database>,
): Promise<number> {
  const { data, error } = await admin
    .from("files")
    .select("id, terminal_id, filename, size_bytes, blob_key, uploaded_at")
    .eq("virus_scan_status", "pending")
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error("[scan] queue query failed:", error.message);
    return 0;
  }

  const pending = (data ?? []) as PendingFile[];
  if (pending.length === 0) return 0;

  // Parallel is fine — each scan is a new TCP connection and clamd handles
  // concurrency natively up to its MaxThreads setting.
  await Promise.all(pending.map((f) => scanOne(admin, f)));
  return pending.length;
}

async function scanOne(
  admin: SupabaseClient<Database>,
  f: PendingFile,
): Promise<void> {
  const label = `${f.filename} [${f.id.slice(0, 8)}]`;

  // If ClamAV isn't wired, auto-skip everything that's over the grace
  // period. New files still pass through `pending` briefly in case the
  // operator stands up clamd later.
  if (!virusScanEnabled()) {
    const ageMs = Date.now() - new Date(f.uploaded_at).getTime();
    if (ageMs < GRACE_MS) return;
    await markStatus(admin, f.id, "skipped", "clamav not configured");
    return;
  }

  if (f.size_bytes > MAX_BYTES) {
    await markStatus(admin, f.id, "skipped", `file too large: ${f.size_bytes}`);
    console.log(`[scan] ${label}: skipped (too large)`);
    return;
  }

  let bytes: Uint8Array;
  try {
    bytes = await getObjectBytes(f.blob_key);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markStatus(admin, f.id, "skipped", `download failed: ${msg}`);
    console.warn(`[scan] ${label}: download failed`, msg);
    return;
  }

  const result = await scanBytes(bytes);
  if (result.kind === "clean") {
    await markStatus(admin, f.id, "clean");
    console.log(`[scan] ✓ ${label}: clean`);
  } else if (result.kind === "infected") {
    await markStatus(admin, f.id, "infected", result.signature);
    console.warn(`[scan] ✗ ${label}: ${result.signature}`);

    // Best-effort audit row so platform admins see it in the events log.
    await admin.from("activity").insert({
      terminal_id: f.terminal_id,
      action: "file.update",
      entity_type: "file",
      entity_id: f.id,
      metadata: { virus: result.signature, filename: f.filename },
    } as never);
  } else {
    // Transient clamd error — leave as pending so the next tick retries.
    console.warn(`[scan] ${label}: transient error:`, result.message);
  }
}

async function markStatus(
  admin: SupabaseClient<Database>,
  fileId: string,
  status: "clean" | "infected" | "skipped",
  result?: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    virus_scan_status: status,
  };
  if (result) patch.virus_scan_result = result;
  const { error } = await admin
    .from("files")
    .update(patch as never)
    .eq("id", fileId);
  if (error) {
    console.error("[scan] mark failed:", error.message);
  }
}
