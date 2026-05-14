-- Rollback for 20260513010000_modules_init.sql
--
-- Drops the four module-system tables and the pane_shell_enabled
-- feature-flag row. Mirrors the inline `-- ROLLBACK:` block in the
-- forward migration; this file exists so the rollback is callable
-- as a standalone .sql (per MODULE_PLAN.md §11.2).
--
-- Apply with:
--   psql $DATABASE_URL < supabase/migrations/rollbacks/20260513010000_modules_init.down.sql

BEGIN;

DELETE FROM feature_flags WHERE key = 'pane_shell_enabled';

-- Drop in reverse dependency order. user_module_pins references
-- modules_catalog; space_modules and terminal_modules reference it
-- too. modules_catalog goes last.
DROP TABLE IF EXISTS user_module_pins CASCADE;
DROP TABLE IF EXISTS terminal_modules CASCADE;
DROP TABLE IF EXISTS space_modules CASCADE;
DROP TABLE IF EXISTS modules_catalog CASCADE;

COMMIT;
