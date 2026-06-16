-- Rollback for 20260616010000_markets_init.sql
--
-- Drops every mkt_* table, removes mkt_quote_cache from the realtime
-- publication, and deletes the 'markets' modules_catalog row. Mirrors the
-- inline `-- ROLLBACK:` block in the forward migration; this standalone
-- file exists so the rollback is callable directly (per MODULE_PLAN.md §11.2).
--
-- Apply with:
--   psql $DATABASE_URL < supabase/migrations/rollbacks/20260616010000_markets_init.down.sql

BEGIN;

DELETE FROM modules_catalog WHERE slug = 'markets';

-- Realtime publication membership must be dropped before the table.
ALTER PUBLICATION supabase_realtime DROP TABLE mkt_quote_cache;

-- Drop in reverse dependency order. Child tables first.
DROP TABLE IF EXISTS mkt_alerts CASCADE;
DROP TABLE IF EXISTS mkt_lots CASCADE;
DROP TABLE IF EXISTS mkt_portfolios CASCADE;
DROP TABLE IF EXISTS mkt_watchlist_symbols CASCADE;
DROP TABLE IF EXISTS mkt_watchlists CASCADE;
DROP TABLE IF EXISTS mkt_quote_cache CASCADE;
DROP TABLE IF EXISTS mkt_instruments CASCADE;

COMMIT;
