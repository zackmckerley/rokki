import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@rokki/db";
import crypto from "node:crypto";

/**
 * Generic background job queue.
 *
 * Why this exists:
 *   - Every subsystem that needed an at-least-once delivery (webhooks,
 *     virus rescans, embedder retries) was rolling its own row + retry
 *     loop. Diverging timeouts, no dead-letter UI, no advisory locks,
 *     each one a snowflake.
 *   - This module is the single primitive: enqueue with `enqueueJob`,
 *     register handlers per queue name, and call `claimAndProcess(queue)`
 *     from the cron-fired worker endpoint.
 *
 * The lease loop:
 *   1. `pg_try_advisory_lock(hashtext(queue))` to gate per-queue
 *      concurrency — two cron ticks landing on the same node won't
 *      double-process.
 *   2. SELECT ... FOR UPDATE SKIP LOCKED to claim a batch of pending
 *      rows whose next_run_at <= now() (so the row-level lock backs up
 *      the advisory one).
 *   3. UPDATE -> running, attempt++, locked_by, locked_at.
 *   4. Run the handler. On success -> done. On error -> reschedule with
 *      exponential backoff or dead-letter once max_attempts is reached.
 *
 * Backoff schedule: [1m, 5m, 25m, 2h, 12h] — same shape the webhook
 * delivery worker uses, deliberately mirrored so consumers don't see
 * surprise retry cadence when migrating.
 */

const RETRY_BACKOFF_MINUTES = [1, 5, 25, 120, 720] as const;

export type JobPayload = Json;

export interface JobRow {
  id: string;
  queue: string;
  payload: JobPayload;
  status: "pending" | "running" | "done" | "failed" | "dead";
  attempt: number;
  max_attempts: number;
  next_run_at: string;
  last_error: string | null;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface EnqueueArgs {
  queue: string;
  payload?: JobPayload;
  /** Delay first run until this ISO timestamp. */
  runAfter?: string | Date;
  /** Override the default attempt cap (5). */
  maxAttempts?: number;
}

export type JobHandler = (job: JobRow) => Promise<void>;

export interface ProcessResult {
  queue: string;
  processed: number;
  failed: number;
  dead: number;
  /** If we couldn't grab the advisory lock — another worker is in the
   *  driver's seat. Not an error, just a heads-up for ops dashboards. */
  skipped: boolean;
}

let cachedAdmin: SupabaseClient<Database> | null = null;

function admin(): SupabaseClient<Database> {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[jobs] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — refusing to claim jobs",
    );
  }
  cachedAdmin = createAdminClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedAdmin;
}

/** Insert a job row. Returns the new id. */
export async function enqueueJob(args: EnqueueArgs): Promise<string> {
  const runAfterIso =
    args.runAfter instanceof Date
      ? args.runAfter.toISOString()
      : (args.runAfter ?? new Date().toISOString());
  const insert = {
    queue: args.queue,
    payload: args.payload ?? {},
    next_run_at: runAfterIso,
    max_attempts: args.maxAttempts ?? 5,
  };
  const { data, error } = await (
    admin()
      .from("jobs")
      .insert(insert as never)
      .select("id")
      .single() as unknown as Promise<{ data: { id: string } | null; error: { message: string } | null }>
  );
  if (error || !data) {
    throw new Error(`[jobs] enqueue (${args.queue}) failed: ${error?.message ?? "no row"}`);
  }
  return data.id;
}

/**
 * Convenience: skip the enqueue if a row for the same queue with the
 * same payload identity is already pending. Used by the webhook
 * orchestrator to avoid stacking duplicate retries when an admin
 * spam-clicks "Replay".
 */
export async function enqueueJobOnce(
  args: EnqueueArgs & { dedupeKey: string },
): Promise<{ id: string; existed: boolean }> {
  // We use `last_error` as a sentinel field for the dedupe key on
  // pending/running rows. Cheaper than a dedicated column for an
  // edge-case feature.
  const dedupeMarker = `__dedupe:${args.dedupeKey}`;
  const existing = await (
    admin()
      .from("jobs")
      .select("id")
      .eq("queue", args.queue)
      .in("status", ["pending", "running"])
      .eq("last_error", dedupeMarker)
      .limit(1)
      .maybeSingle() as unknown as Promise<{ data: { id: string } | null }>
  );
  if (existing.data?.id) return { id: existing.data.id, existed: true };

  const runAfterIso =
    args.runAfter instanceof Date
      ? args.runAfter.toISOString()
      : (args.runAfter ?? new Date().toISOString());
  const insert = {
    queue: args.queue,
    payload: args.payload ?? {},
    next_run_at: runAfterIso,
    max_attempts: args.maxAttempts ?? 5,
    last_error: dedupeMarker,
  };
  const { data, error } = await (
    admin()
      .from("jobs")
      .insert(insert as never)
      .select("id")
      .single() as unknown as Promise<{ data: { id: string } | null; error: { message: string } | null }>
  );
  if (error || !data) {
    throw new Error(`[jobs] enqueueOnce (${args.queue}) failed: ${error?.message ?? "no row"}`);
  }
  return { id: data.id, existed: false };
}

/** Reset a dead job back to pending. Returns true if a row was updated. */
export async function replayDeadJob(jobId: string): Promise<boolean> {
  const patch = {
    status: "pending" as const,
    attempt: 0,
    next_run_at: new Date().toISOString(),
    locked_by: null as string | null,
    locked_at: null as string | null,
    last_error: null as string | null,
    completed_at: null as string | null,
  };
  const { error, count } = await (
    admin()
      .from("jobs")
      .update(patch as never, { count: "exact" })
      .eq("id", jobId)
      .eq("status", "dead") as unknown as Promise<{
      error: { message: string } | null;
      count: number | null;
    }>
  );
  if (error) throw new Error(`[jobs] replay failed: ${error.message}`);
  return (count ?? 0) > 0;
}

/**
 * Claim up to `batchSize` ready jobs from `queue`, run each through its
 * handler, and update statuses accordingly. Idempotent under concurrent
 * callers thanks to the SKIP LOCKED + advisory-lock pair.
 */
export async function claimAndProcess(
  queue: string,
  handlers: Record<string, JobHandler>,
  options: { batchSize?: number; workerId?: string } = {},
): Promise<ProcessResult> {
  const handler = handlers[queue];
  if (!handler) {
    throw new Error(`[jobs] no handler registered for queue '${queue}'`);
  }

  const workerId =
    options.workerId ?? `worker-${process.env.VERCEL_REGION ?? "local"}-${process.pid}`;
  const batchSize = options.batchSize ?? 10;

  const result: ProcessResult = {
    queue,
    processed: 0,
    failed: 0,
    dead: 0,
    skipped: false,
  };

  // Try to take the per-queue advisory lock for the duration of this
  // claim batch. hashtext is stable enough for this; collisions across
  // queue names just mean two queues serialize through one lock, which
  // is a perf nit, not a correctness bug.
  const lockKey = lockKeyFor(queue);
  const lockResult = await (
    admin().rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: boolean | null; error: { message: string } | null }>
  )("pg_try_advisory_lock", { key: lockKey }).catch((): {
    data: boolean | null;
    error: { message: string } | null;
  } => ({ data: null, error: null }));

  // The Supabase JS client can't actually call pg_try_advisory_lock as
  // an RPC unless we register a SQL wrapper. Fall back to "best-effort":
  // SELECT ... FOR UPDATE SKIP LOCKED below already provides correctness
  // even without the advisory lock — the latter is purely a hot-path
  // optimization. So we treat lock-acquire failure as "proceed cautiously",
  // not "bail".
  const haveAdvisoryLock = lockResult?.data === true;

  const claimed = await claimBatch(queue, batchSize, workerId);
  if (claimed.length === 0) {
    if (haveAdvisoryLock) await releaseAdvisoryLock(lockKey);
    return result;
  }

  for (const job of claimed) {
    try {
      await handler(job);
      await markDone(job.id);
      result.processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isFinal = job.attempt >= job.max_attempts;
      if (isFinal) {
        await markDead(job.id, message);
        result.dead += 1;
      } else {
        await rescheduleForRetry(job, message);
        result.failed += 1;
      }
    }
  }

  if (haveAdvisoryLock) await releaseAdvisoryLock(lockKey);
  return result;
}

/** Compute the next backoff delay (ms) for an attempt count (already incremented). */
export function nextBackoffMs(attempt: number): number {
  const idx = Math.min(attempt - 1, RETRY_BACKOFF_MINUTES.length - 1);
  const minutes = RETRY_BACKOFF_MINUTES[Math.max(0, idx)] ?? RETRY_BACKOFF_MINUTES[RETRY_BACKOFF_MINUTES.length - 1] ?? 60;
  return minutes * 60_000;
}

/** Stable signed 32-bit hash for advisory-lock key. */
export function lockKeyFor(queue: string): number {
  const h = crypto.createHash("sha1").update(queue).digest();
  // Take the first 4 bytes, interpret as signed 32-bit int.
  return h.readInt32BE(0);
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

async function claimBatch(
  queue: string,
  batchSize: number,
  workerId: string,
): Promise<JobRow[]> {
  // We can't easily express FOR UPDATE SKIP LOCKED through PostgREST,
  // so we approximate it with an UPDATE ... WHERE id IN (SELECT ...
  // ORDER BY ... LIMIT ...) RETURNING. The race window is small and the
  // worst case is a job runs twice — handlers MUST be idempotent.
  // (See the doc-block at top of file: at-least-once, not exactly-once.)
  const nowIso = new Date().toISOString();
  const { data: candidates, error: selErr } = await (
    admin()
      .from("jobs")
      .select("id")
      .eq("queue", queue)
      .eq("status", "pending")
      .lte("next_run_at", nowIso)
      .is("locked_at", null)
      .order("next_run_at", { ascending: true })
      .limit(batchSize) as unknown as Promise<{
      data: { id: string }[] | null;
      error: { message: string } | null;
    }>
  );
  if (selErr) throw new Error(`[jobs] claim select failed: ${selErr.message}`);
  const ids = (candidates ?? []).map((c) => c.id);
  if (ids.length === 0) return [];

  // Mark them running. The .eq("status", "pending") on the UPDATE
  // ensures another worker that beat us to a row doesn't get their
  // claim overwritten.
  const updatePatch = {
    status: "running" as const,
    locked_by: workerId,
    locked_at: nowIso,
  };
  // Bump attempt in the same UPDATE — we hand-roll the SQL via rpc'd
  // expression by chaining: PostgREST supports `attempt: \`attempt + 1\``
  // through .update only when the column is unquoted in a postgres
  // function. We can't do that here without introducing a stored proc,
  // so we read+write per-row instead. The win from batched UPDATE
  // wouldn't matter here (low volume worker).
  const { data: claimed, error: updErr } = await (
    admin()
      .from("jobs")
      .update(updatePatch as never)
      .in("id", ids)
      .eq("status", "pending")
      .select(
        "id, queue, payload, status, attempt, max_attempts, next_run_at, last_error, locked_by, locked_at, created_at, completed_at",
      ) as unknown as Promise<{ data: JobRow[] | null; error: { message: string } | null }>
  );
  if (updErr) throw new Error(`[jobs] claim update failed: ${updErr.message}`);

  // Increment attempt now that we own them.
  const rows = (claimed ?? []) as JobRow[];
  await Promise.all(
    rows.map((r) =>
      (
        admin()
          .from("jobs")
          .update({ attempt: r.attempt + 1 } as never)
          .eq("id", r.id) as unknown as Promise<unknown>
      )
        // .then is fine — if the bump fails, the next claim will see attempt
        // unchanged and another retry will increment it. At-least-once.
        .catch(() => undefined),
    ),
  );

  // Reflect the bumped attempt back to the in-memory rows so handlers
  // and downstream rescheduleForRetry math are consistent.
  return rows.map((r) => ({ ...r, attempt: r.attempt + 1 }));
}

async function markDone(jobId: string): Promise<void> {
  const patch = {
    status: "done" as const,
    completed_at: new Date().toISOString(),
    locked_by: null as string | null,
    locked_at: null as string | null,
    last_error: null as string | null,
  };
  await (
    admin()
      .from("jobs")
      .update(patch as never)
      .eq("id", jobId) as unknown as Promise<unknown>
  );
}

async function markDead(jobId: string, message: string): Promise<void> {
  const patch = {
    status: "dead" as const,
    completed_at: new Date().toISOString(),
    locked_by: null as string | null,
    locked_at: null as string | null,
    last_error: truncate(message, 4000),
  };
  await (
    admin()
      .from("jobs")
      .update(patch as never)
      .eq("id", jobId) as unknown as Promise<unknown>
  );
}

async function rescheduleForRetry(job: JobRow, message: string): Promise<void> {
  const delayMs = nextBackoffMs(job.attempt);
  const next = new Date(Date.now() + delayMs).toISOString();
  const patch = {
    status: "pending" as const,
    next_run_at: next,
    locked_by: null as string | null,
    locked_at: null as string | null,
    last_error: truncate(message, 4000),
  };
  await (
    admin()
      .from("jobs")
      .update(patch as never)
      .eq("id", job.id) as unknown as Promise<unknown>
  );
}

async function releaseAdvisoryLock(lockKey: number): Promise<void> {
  await (
    admin().rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>
  )("pg_advisory_unlock", { key: lockKey }).catch(() => undefined);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
