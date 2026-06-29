-- Per-goal tracking cadence — how often you log a value for a goal.
--
--   daily   = log each day (the week's 7 daily values roll up against the target)
--   weekly  = log one value per week
--   monthly = log one value per month
--
-- Not everything is a daily habit: some goals you only check in on weekly or
-- monthly. The goal's target (goals_targets.weekly_target) is read as "per the
-- goal's window" — weekly for daily/weekly goals, monthly for monthly goals.
-- An entry's `entry_date` is the bucket start: the day for daily, the week's
-- Monday for weekly, the 1st for monthly.

BEGIN;

ALTER TABLE goals_goals
  ADD COLUMN period TEXT NOT NULL DEFAULT 'daily'
    CHECK (period IN ('daily', 'weekly', 'monthly'));

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- ALTER TABLE goals_goals DROP COLUMN IF EXISTS period;
-- COMMIT;
