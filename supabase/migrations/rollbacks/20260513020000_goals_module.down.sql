-- Rollback for 20260513020000_goals_module.sql
--
-- Drops the five goals_* tables in reverse dependency order. Cascade
-- handles the FK chains.
--
-- Apply with:
--   psql $DATABASE_URL < supabase/migrations/rollbacks/20260513020000_goals_module.down.sql

BEGIN;

DROP TABLE IF EXISTS goals_settings CASCADE;
DROP TABLE IF EXISTS goals_entries CASCADE;
DROP TABLE IF EXISTS goals_targets CASCADE;
DROP TABLE IF EXISTS goals_goals CASCADE;
DROP TABLE IF EXISTS goals_categories CASCADE;

COMMIT;
