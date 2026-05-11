-- Drop the diagnostic `_debug_error_log` table.
--
-- This was added as a temporary parallel sink for runtime errors so we
-- could read the actual stack remotely without depending on Sentry
-- config. It chased down two specific bugs:
--
--   1. The "navigation-stuck" issue resolved by PR #109 (theme +
--      hydration fixes).
--   2. The ticker `undefined.id` crash resolved by PR #119.
--
-- Both root causes are identified and fixed. The table now holds
-- duplicated info we already capture via Sentry, and its existence
-- (with a service-role-only insert path) is residual attack surface
-- worth removing. The route at /api/v1/health/error-log is deleted in
-- the same PR; this migration removes the now-orphaned storage.
--
-- Safe to drop: no foreign keys, no consumers, no rotation policy.
-- Existing rows aren't useful — we already pulled the insights we
-- needed (see PR #119).

BEGIN;

DROP TABLE IF EXISTS _debug_error_log;

COMMIT;
