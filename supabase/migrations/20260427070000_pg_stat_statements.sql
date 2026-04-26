-- pg_stat_statements wiring for the /admin/perf slow-query dashboard.
--
-- The extension is admin-only at the Postgres level. On Supabase it needs
-- to be enabled first via the dashboard:
--   Database -> Extensions -> search "pg_stat_statements" -> Enable.
--
-- The CREATE EXTENSION below is a no-op when the extension is already
-- enabled at the project level, but lets local supabase stacks (which
-- run the migration as superuser) get it for free.
--
-- Three RPCs wrap the view + its reset/explain helpers so:
--   1. Service-role queries don't have to talk to the catalog directly
--      (pg_stat_statements lives in the extension's own schema and isn't
--      in the generated TypeScript types).
--   2. We can normalize the row shape once in SQL.
--   3. EXPLAIN runs server-side under SECURITY DEFINER, so we can
--      restrict it via the function body without giving the API caller
--      arbitrary EXPLAIN privileges on every table.
--
-- All three functions revoke EXECUTE from PUBLIC and grant only to
-- service_role, which matches how other admin-only RPCs are exposed.

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ----------------------------------------------------------------------------
-- get_slow_queries(_limit)
-- Top N queries by mean_exec_time. Filters out the queries that
-- pg_stat_statements emits about itself + this function.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_slow_queries(_limit INT DEFAULT 50)
RETURNS TABLE (
  query TEXT,
  calls BIGINT,
  mean_exec_time DOUBLE PRECISION,
  total_exec_time DOUBLE PRECISION,
  rows BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- pg_stat_statements stores already-normalized queries (literals
    -- replaced with $N placeholders). Truncate to keep the table dense.
    LEFT(s.query, 500)::TEXT AS query,
    s.calls::BIGINT,
    s.mean_exec_time::DOUBLE PRECISION,
    s.total_exec_time::DOUBLE PRECISION,
    s.rows::BIGINT
  FROM pg_stat_statements s
  WHERE s.query NOT ILIKE '%pg_stat_statements%'
    AND s.query NOT ILIKE '%get_slow_queries%'
  ORDER BY s.mean_exec_time DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
END $$;

-- ----------------------------------------------------------------------------
-- reset_slow_queries()
-- Wraps pg_stat_statements_reset(). Returns a sentinel for the API.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_slow_queries()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  PERFORM pg_stat_statements_reset();
  RETURN TRUE;
END $$;

-- ----------------------------------------------------------------------------
-- explain_slow_query(_query)
-- Runs EXPLAIN (no ANALYZE — we don't want to actually execute) on the
-- supplied normalized statement after replacing $N parameter placeholders
-- with NULL literals, since we don't know real values. NULL is type-safe
-- for explain and won't accidentally hit RLS.
--
-- Refuses anything that isn't a SELECT to avoid surprise side-effects
-- if a caller passes a normalized DML.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.explain_slow_query(_query TEXT)
RETURNS TABLE (line TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  _safe TEXT;
BEGIN
  IF _query IS NULL OR length(trim(_query)) = 0 THEN
    RAISE EXCEPTION 'empty query';
  END IF;
  -- Allow only SELECT statements through.
  IF lower(trim(_query)) NOT LIKE 'select%'
     AND lower(trim(_query)) NOT LIKE 'with%' THEN
    RAISE EXCEPTION 'only SELECT/WITH statements may be EXPLAINed';
  END IF;
  -- Replace $1, $2, ... with NULL so the planner can parse them.
  _safe := regexp_replace(_query, '\$\d+', 'NULL', 'g');

  RETURN QUERY
  EXECUTE 'EXPLAIN ' || _safe;
END $$;

-- ----------------------------------------------------------------------------
-- Lock down: only service_role gets to call these.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_slow_queries(INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_slow_queries() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.explain_slow_query(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_slow_queries(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_slow_queries() TO service_role;
GRANT EXECUTE ON FUNCTION public.explain_slow_query(TEXT) TO service_role;

COMMENT ON FUNCTION public.get_slow_queries IS
  'Top-N pg_stat_statements rows by mean_exec_time. Service-role only.';
COMMENT ON FUNCTION public.reset_slow_queries IS
  'Calls pg_stat_statements_reset(). Service-role only.';
COMMENT ON FUNCTION public.explain_slow_query IS
  'EXPLAIN (no ANALYZE) for a pg_stat_statements normalized query, with $N -> NULL substitution. SELECT/WITH only. Service-role only.';
