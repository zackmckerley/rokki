-- Goals: decouple the target window from the logging cadence.
--
-- `period` stays the *record cadence* (how often you log: daily / weekly /
-- monthly). `target_period` is a new, independent choice of the window the
-- target is measured over: per day / week / month. Most goals will match
-- (daily+week is the historical default), but this lets e.g. "log daily, hit a
-- monthly total" or "log daily, hit a per-day number".

ALTER TABLE goals_goals
  ADD COLUMN target_period text NOT NULL DEFAULT 'week'
  CHECK (target_period IN ('day', 'week', 'month'));

-- Backfill to preserve current behavior: monthly-cadence goals were measured
-- over the month; everything else over the week.
UPDATE goals_goals SET target_period = 'month' WHERE period = 'monthly';
