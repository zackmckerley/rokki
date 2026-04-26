-- Activity-log enrichment with before/after diffs.
--
-- The existing `activity` table answers WHO did WHAT. This migration adds
-- WHAT-CHANGED-EXACTLY for every UPDATE on the user-content tables that
-- benefit from a diff timeline (tasks, terminals, spaces, files, comments).
--
-- Approach:
--   1. Add `before_json` + `after_json` JSONB columns to activity.
--   2. Add new enum values `<table>_updated` so triggers don't collide with
--      the existing app-level dotted actions (task.update, file.update, etc.).
--      The dotted values stay as the curated app-level events ("task got
--      reassigned"); the new `_updated` values are mechanical row diffs.
--   3. Build a single generic `log_row_change()` trigger function that
--      captures OLD/NEW as jsonb and writes one activity row per real change.
--   4. Attach AFTER UPDATE triggers to: tasks, terminals, spaces, files,
--      comments. We deliberately skip noisy / per-keystroke tables
--      (notifications, presence, ticker counters, file_chunks, push_subs,
--      thread_participants.last_read_at, rate-limit counters).
--   5. The trigger inserts via SECURITY DEFINER so RLS on `activity`
--      doesn't block the INSERT. The `activity` table already has no
--      user-facing INSERT policy; writes are service-role only by spec.
--
-- Idempotency:
--   - The trigger short-circuits if OLD jsonb = NEW jsonb (no real change).
--   - It also strips its own `updated_at` column from the comparison so a
--     trigger that bumps updated_at doesn't masquerade as a real change.

BEGIN;

-- ============================================================================
-- 1. activity columns
-- ============================================================================

ALTER TABLE activity
  ADD COLUMN IF NOT EXISTS before_json JSONB,
  ADD COLUMN IF NOT EXISTS after_json JSONB;

-- A partial index so the History tab and admin diff column filter quickly
-- to "rows that have a diff" without scanning every audit row.
CREATE INDEX IF NOT EXISTS idx_activity_entity_with_diff
  ON activity(entity_type, entity_id, created_at DESC)
  WHERE before_json IS NOT NULL OR after_json IS NOT NULL;

-- ============================================================================
-- 2. New enum values for trigger-emitted diffs
-- ============================================================================
-- ALTER TYPE … ADD VALUE cannot run inside a transaction that later uses the
-- value, so we run these in their own block. They're idempotent via IF NOT
-- EXISTS (Postgres 12+).

COMMIT;

ALTER TYPE activity_action ADD VALUE IF NOT EXISTS 'tasks_updated';
ALTER TYPE activity_action ADD VALUE IF NOT EXISTS 'terminals_updated';
ALTER TYPE activity_action ADD VALUE IF NOT EXISTS 'spaces_updated';
ALTER TYPE activity_action ADD VALUE IF NOT EXISTS 'files_updated';
ALTER TYPE activity_action ADD VALUE IF NOT EXISTS 'comments_updated';

BEGIN;

-- ============================================================================
-- 3. Generic trigger function
-- ============================================================================
--
-- Behaviour:
--   * AFTER UPDATE FOR EACH ROW
--   * Compares OLD and NEW (cast to jsonb), minus a small set of "noisy"
--     columns that we never want to count as a change (updated_at).
--   * If any other column actually differs, inserts an activity row with:
--       - action       = '<TG_TABLE_NAME>_updated'  (e.g. 'tasks_updated')
--       - entity_type  = singular form of the table (tasks → task)
--       - entity_id    = NEW.id
--       - actor_id     = auth.uid() if available (regular user request)
--                        else NEW.updated_by / NEW.created_by if those exist
--                        else NULL (system change)
--       - terminal_id  = NEW.terminal_id when the table has one
--       - space_id     = NEW.space_id when the table has one (spaces row's own
--                        id is mirrored into space_id for the spaces table)
--       - before_json  = to_jsonb(OLD)
--       - after_json   = to_jsonb(NEW)
--
-- Inserts run with SECURITY DEFINER so the trigger isn't blocked by RLS on
-- activity (which has no user-facing INSERT policy by design).
--
-- The function is intentionally generic and inspects NEW dynamically via
-- jsonb. Adding a new audited table is one ATTACH below, no function edit.

CREATE OR REPLACE FUNCTION log_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_json   JSONB;
  new_json   JSONB;
  diff_old   JSONB;
  diff_new   JSONB;
  ent_id     UUID;
  ent_type   TEXT;
  act_name   activity_action;
  actor      UUID;
  term_id    UUID;
  spc_id     UUID;
BEGIN
  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  -- Strip columns we never want to flag as a change. updated_at gets bumped
  -- by another trigger; including it would mark every UPDATE as a diff.
  diff_old := old_json - 'updated_at';
  diff_new := new_json - 'updated_at';

  -- No-op UPDATE? Bail without polluting the log.
  IF diff_old = diff_new THEN
    RETURN NEW;
  END IF;

  -- Resolve the action enum from the table name.
  act_name := (TG_TABLE_NAME || '_updated')::activity_action;

  -- entity_type is singular: tasks → task, files → file, comments → comment,
  -- terminals → terminal, spaces → space.
  ent_type := CASE TG_TABLE_NAME
    WHEN 'tasks'     THEN 'task'
    WHEN 'terminals' THEN 'terminal'
    WHEN 'spaces'    THEN 'space'
    WHEN 'files'     THEN 'file'
    WHEN 'comments'  THEN 'comment'
    ELSE TG_TABLE_NAME
  END;

  -- entity_id = NEW.id (every audited table has a uuid PK called `id`).
  ent_id := (new_json->>'id')::UUID;

  -- Actor: prefer the authenticated session, else any *_by column the row
  -- already carries. NULL means "system or service-role write with no
  -- session" — that's fine and deliberate.
  actor := auth.uid();
  IF actor IS NULL THEN
    actor := COALESCE(
      NULLIF(new_json->>'updated_by', '')::UUID,
      NULLIF(new_json->>'created_by', '')::UUID,
      NULLIF(new_json->>'uploaded_by', '')::UUID
    );
  END IF;

  -- Scope columns when present.
  term_id := NULLIF(new_json->>'terminal_id', '')::UUID;
  IF TG_TABLE_NAME = 'terminals' THEN
    -- Self-reference so the per-terminal History tab finds the row.
    term_id := ent_id;
    spc_id  := NULLIF(new_json->>'space_id', '')::UUID;
  ELSIF TG_TABLE_NAME = 'spaces' THEN
    spc_id := ent_id;
  ELSE
    spc_id := NULLIF(new_json->>'space_id', '')::UUID;
  END IF;

  INSERT INTO activity (
    space_id,
    terminal_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    before_json,
    after_json
  )
  VALUES (
    spc_id,
    term_id,
    actor,
    act_name,
    ent_type,
    ent_id,
    jsonb_build_object('source', 'trigger'),
    diff_old,
    diff_new
  );

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION log_row_change() TO authenticated, service_role;

-- ============================================================================
-- 4. Attach triggers to the audited tables
-- ============================================================================

DROP TRIGGER IF EXISTS trg_tasks_diff ON tasks;
CREATE TRIGGER trg_tasks_diff
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_row_change();

DROP TRIGGER IF EXISTS trg_terminals_diff ON terminals;
CREATE TRIGGER trg_terminals_diff
  AFTER UPDATE ON terminals
  FOR EACH ROW
  EXECUTE FUNCTION log_row_change();

DROP TRIGGER IF EXISTS trg_spaces_diff ON spaces;
CREATE TRIGGER trg_spaces_diff
  AFTER UPDATE ON spaces
  FOR EACH ROW
  EXECUTE FUNCTION log_row_change();

DROP TRIGGER IF EXISTS trg_files_diff ON files;
CREATE TRIGGER trg_files_diff
  AFTER UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION log_row_change();

DROP TRIGGER IF EXISTS trg_comments_diff ON comments;
CREATE TRIGGER trg_comments_diff
  AFTER UPDATE ON comments
  FOR EACH ROW
  EXECUTE FUNCTION log_row_change();

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_tasks_diff ON tasks;
-- DROP TRIGGER IF EXISTS trg_terminals_diff ON terminals;
-- DROP TRIGGER IF EXISTS trg_spaces_diff ON spaces;
-- DROP TRIGGER IF EXISTS trg_files_diff ON files;
-- DROP TRIGGER IF EXISTS trg_comments_diff ON comments;
-- DROP FUNCTION IF EXISTS log_row_change();
-- DROP INDEX IF EXISTS idx_activity_entity_with_diff;
-- ALTER TABLE activity DROP COLUMN IF EXISTS before_json, DROP COLUMN IF EXISTS after_json;
-- -- Note: enum values added above can't be dropped without recreating the type.
-- COMMIT;
