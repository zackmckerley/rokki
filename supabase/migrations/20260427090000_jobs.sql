-- Generic background job queue.
--
-- Replaces ad-hoc worker endpoints (each subsystem rolling its own retry
-- and locking) with a single `jobs` table that any handler can enqueue
-- against. The brain of the system is `claimAndProcess(queue, handlers)`
-- in apps/web/src/lib/jobs.ts — see that file for the leasing semantics.
--
-- Queue conventions:
--   webhook_delivery   : payload = { delivery_id, destination_id, event_id }
--   ...future queues here as they're added
--
-- Why not just lean on pg_cron alone? pg_cron schedules SQL, not workers.
-- We still need an at-least-once delivery primitive with claim/lock,
-- exponential backoff, dead-letter, and a UI. pg_cron's role here is just
-- to fire the cron tick that posts to /api/v1/admin/jobs/process; the
-- actual work happens in the Node worker so handlers can use the rest of
-- the JS ecosystem (signed URLs, fetch with HMAC, etc.).
--
-- IMPORTANT: pg_cron must be enabled in the Supabase dashboard before this
-- migration runs cleanly on a hosted project ("Database -> Extensions ->
-- pg_cron"). Local supabase start has it pre-enabled. CREATE EXTENSION
-- below is a no-op when the extension is already on, so this stays
-- idempotent across dev/CI/prod.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- jobs
-- ============================================================================
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue TEXT NOT NULL CHECK (char_length(queue) BETWEEN 1 AND 64),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed', 'dead')),
  attempt INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- The claim query filters by (queue, status, next_run_at) — this index
-- supports it directly. We deliberately do NOT make this partial on
-- `status='pending'` because then re-queued retries (still status='pending'
-- but next_run_at in the future) wouldn't benefit either.
CREATE INDEX idx_jobs_claim
  ON jobs(queue, status, next_run_at);

-- Ops queries: "show me everything in dead-letter" / "recent failures".
CREATE INDEX idx_jobs_status_recent
  ON jobs(status, created_at DESC);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Platform admins only. Workers operate via the service-role client
-- (bypasses RLS) — the policy is purely so a curious user with a
-- pre-existing access token can't peek at queue payloads.
CREATE POLICY "jobs_admin_all" ON jobs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  );

-- ============================================================================
-- webhook_deliveries: backfill columns the new orchestrator needs
-- ============================================================================
-- The previous webhook_deliveries shape stored only one row per attempt.
-- Now the row is the *delivery* (one per destination per event); the
-- orchestrator updates the same row with each attempt and writes a job
-- row alongside it for retry scheduling. We keep the old columns for
-- compatibility with anything reading historical rows.
ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS event_id UUID
    REFERENCES domain_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dead_at TIMESTAMPTZ;

-- Loosen the status enum so dead-letter rows have somewhere to live.
-- The original CHECK only allowed pending/success/error, so writing
-- 'dead' would have errored.
ALTER TABLE webhook_deliveries
  DROP CONSTRAINT IF EXISTS webhook_deliveries_status_check;
ALTER TABLE webhook_deliveries
  ADD CONSTRAINT webhook_deliveries_status_check
    CHECK (status IN ('pending', 'success', 'error', 'dead'));

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status
  ON webhook_deliveries(status, attempted_at DESC);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_webhook_deliveries_status;
-- ALTER TABLE webhook_deliveries
--   DROP CONSTRAINT IF EXISTS webhook_deliveries_status_check;
-- ALTER TABLE webhook_deliveries
--   ADD CONSTRAINT webhook_deliveries_status_check
--     CHECK (status IN ('pending', 'success', 'error'));
-- ALTER TABLE webhook_deliveries
--   DROP COLUMN IF EXISTS dead_at,
--   DROP COLUMN IF EXISTS delivered_at,
--   DROP COLUMN IF EXISTS last_attempt_at,
--   DROP COLUMN IF EXISTS event_id;
-- DROP POLICY IF EXISTS "jobs_admin_all" ON jobs;
-- DROP INDEX IF EXISTS idx_jobs_status_recent;
-- DROP INDEX IF EXISTS idx_jobs_claim;
-- DROP TABLE IF EXISTS jobs;
-- (pg_cron extension intentionally left in place — other migrations may use it.)
