-- Priority redesign per Zack: three named tiers + "no priority"
-- (was a 1–4 scale).
--
--   Old:                      New:
--     1 = P1 critical           1 = High
--     2 = P2 high               2 = Medium
--     3 = P3 normal (default)   3 = Low
--     4 = P4 low                NULL = no priority
--
-- Mapping for the existing rows:
--   1 (critical), 2 (high)        →  1 (High)
--   3 (normal, the most common)   →  2 (Medium)
--   4 (low)                       →  3 (Low)
--
-- The column was NOT NULL with default=3. New default is NULL.
-- The check constraint changes from `BETWEEN 1 AND 4` to
-- `IS NULL OR BETWEEN 1 AND 3`.

BEGIN;

-- 1. Drop the existing CHECK constraint so we can rewrite values
--    that fall outside the new range.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;

-- 2. Remap existing values.
UPDATE tasks
SET priority = CASE priority
  WHEN 1 THEN 1   -- was critical → High
  WHEN 2 THEN 1   -- was high → High
  WHEN 3 THEN 2   -- was normal → Medium
  WHEN 4 THEN 3   -- was low → Low
  ELSE priority   -- defensive: leave anything else alone
END
WHERE priority IS NOT NULL;

-- 3. Drop NOT NULL + default so rows can land at "no priority".
ALTER TABLE tasks ALTER COLUMN priority DROP NOT NULL;
ALTER TABLE tasks ALTER COLUMN priority DROP DEFAULT;

-- 4. New CHECK: null or 1..3.
ALTER TABLE tasks
  ADD CONSTRAINT tasks_priority_check
  CHECK (priority IS NULL OR (priority BETWEEN 1 AND 3));

COMMENT ON COLUMN tasks.priority IS
  'Task priority. NULL = no priority (default). 1 = High, 2 = Medium, 3 = Low. Old 1–4 scale was remapped on 2026-05-07.';

COMMIT;
