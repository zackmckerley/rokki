-- Atomic additive logging for Goals.
--
-- The dashboard quick-log is a "+N" affordance: it ADDS N to today's running
-- total. Doing that as a client-side read-then-write races — two quick logs can
-- both read the same value and the second clobbers the first. This RPC folds
-- the read+add into a single atomic INSERT ... ON CONFLICT DO UPDATE, so
-- concurrent increments accumulate correctly.
--
-- SECURITY INVOKER (the default): the INSERT/UPDATE runs as the calling user, so
-- the existing goals_entries_write RLS (goal_id must be a goal the caller can
-- see) authorizes it — no privilege escalation. The running total is clamped at
-- 0 so a negative correction can zero out a goal but never drive it negative.

BEGIN;

CREATE OR REPLACE FUNCTION goals_add_entry(
  p_goal_id uuid,
  p_entry_date date,
  p_delta numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_value numeric;
BEGIN
  INSERT INTO goals_entries (goal_id, entry_date, value, source)
  VALUES (p_goal_id, p_entry_date, GREATEST(0, p_delta), 'manual')
  ON CONFLICT (goal_id, entry_date)
  DO UPDATE SET
    value = GREATEST(0, goals_entries.value + p_delta),
    updated_at = now()
  RETURNING value INTO v_value;
  RETURN v_value;
END;
$$;

GRANT EXECUTE ON FUNCTION goals_add_entry(uuid, date, numeric) TO authenticated;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP FUNCTION IF EXISTS goals_add_entry(uuid, date, numeric);
-- COMMIT;
