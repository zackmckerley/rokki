-- Webhook delivery: retries with exponential backoff + dead-letter queue.
--
-- The original `webhook_deliveries` table (admin_polish migration) only
-- recorded a single attempt result. Real outbound webhooks need a queue
-- with scheduled retries — receivers go down, hit timeouts, return 5xx
-- on the first call and recover later.
--
-- Schedule: 1m, 5m, 25m, 2h, 12h. After 5 failed attempts the row is
-- marked `dead_lettered_at`; an operator can replay from /admin/webhooks.

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Existing rows from before this migration are treated as terminal:
-- whatever happened on the single attempted_at is what we have. Mark
-- successful ones delivered, failed ones dead-lettered, so the
-- "process-due" worker doesn't try to resurrect them.
UPDATE webhook_deliveries
   SET delivered_at = attempted_at
 WHERE status = 'success' AND delivered_at IS NULL;

UPDATE webhook_deliveries
   SET dead_lettered_at = attempted_at,
       last_error = COALESCE(response_body, 'pre-retry-system delivery')
 WHERE status = 'error' AND dead_lettered_at IS NULL;

-- Index used by the worker poll: pending rows whose retry window opened.
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
  ON webhook_deliveries(next_attempt_at)
  WHERE delivered_at IS NULL AND dead_lettered_at IS NULL;

-- Existing read policy `wh_del_read` already lets platform admins SELECT.
-- We add UPDATE so the replay button can clear `dead_lettered_at` and
-- reset `next_attempt_at` from the admin UI. Service-role bypasses RLS
-- and handles the worker writes.
CREATE POLICY "wh_del_admin_update" ON webhook_deliveries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_platform_admin
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_platform_admin
    )
  );
