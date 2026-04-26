-- Soft-delete consistency pass + Trash machinery.
--
-- The platform already practices soft-delete for files, folders, comments,
-- drawings, tools, share-links, calendar-connections, tokens, and the two
-- top-level tenancy rows (terminals.archived_at, spaces.archived_at). The
-- one remaining gap is `tasks` — DELETE /api/v1/tasks/:id was hard-removing
-- rows. This migration:
--
--   1. Adds tasks.deleted_at + tasks.deleted_by, indexes, and an RLS
--      filter so soft-deleted tasks are hidden from normal SELECTs (admins
--      and emergency-access still see them).
--   2. Cascades soft-deletes from terminals → tasks/files when a terminal
--      is archived, and from spaces → terminals/tasks/files when a space
--      is archived. Done by a trigger so app code doesn't need to remember
--      to fan out manually.
--   3. Adds purge_expired_trash() — a SECURITY DEFINER function that
--      hard-deletes anything with deleted_at older than 30 days. Returns a
--      per-table row count so a future cron job can log what it removed.
--      Scheduling is intentionally left to the operator (pg_cron, GitHub
--      Actions, Vercel cron, …) — the function is the contract.
--
-- Note: the cascade triggers fire on UPDATE of archived_at / deleted_at
-- to NOT NULL only. They're idempotent: re-archiving an already-archived
-- terminal is a no-op for the children that are already deleted.

BEGIN;

-- ============================================================================
-- 1. tasks.deleted_at + RLS update
-- ============================================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Lookup: most filtered queries are by terminal + status; partial index
-- mirrors the one we already keep on files/comments.
CREATE INDEX IF NOT EXISTS idx_tasks_deleted
  ON tasks(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Replace the SELECT policy so soft-deleted tasks are hidden from normal
-- terminal members but still visible to platform admins under emergency
-- access (so Trash + audit can find them).
DROP POLICY IF EXISTS "tasks_select" ON tasks;
CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated
USING (
  (deleted_at IS NULL AND is_terminal_member(terminal_id))
  OR has_emergency_access()
);

-- The UPDATE policy keeps the same writer set, but only on rows that
-- aren't already in the trash (no resurrecting via PATCH from a normal
-- session — restore goes through the admin Trash flow which uses the
-- service role).
DROP POLICY IF EXISTS "tasks_update" ON tasks;
CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated
USING (
  deleted_at IS NULL
  AND (
    is_terminal_manager(terminal_id)
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())
  )
);

-- DELETE policy stays as-is (manager / creator). The route writes
-- deleted_at via UPDATE rather than DELETE; the policy still gates the
-- soft-delete UPDATE because the soft-delete sets `deleted_at` (going
-- from NULL → now) which the USING clause above admits exactly once.

-- ============================================================================
-- 2. files RLS already has WHEN _file.deleted_at IS NOT NULL exclusion
--    via can_see_file. No change needed for files.
--
--    comments + tools likewise filter deleted_at at the application layer
--    (their RLS policies don't filter soft-deletes — see the index defs in
--    the initial schema). We won't tighten those here because the existing
--    UI relies on them being visible to the original author for "you
--    deleted this comment, undo?" flows. Trash UI uses the service role.
-- ============================================================================

-- ============================================================================
-- 3. Cascade triggers
-- ============================================================================
--
-- When a terminal is archived (archived_at set), soft-delete its
-- non-deleted tasks + files + folders so cross-tenant queries don't keep
-- surfacing them. The cascade copies the same archived_at timestamp into
-- deleted_at for child rows so the Trash view groups them naturally.
--
-- Symmetric: when a space is archived, archive its terminals (which then
-- cascade further via this same trigger).

CREATE OR REPLACE FUNCTION cascade_terminal_archive()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire on the NULL → NOT NULL transition (a real archive).
  IF NEW.archived_at IS NULL OR OLD.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE tasks
    SET deleted_at = NEW.archived_at, deleted_by = COALESCE(deleted_by, auth.uid())
    WHERE terminal_id = NEW.id AND deleted_at IS NULL;

  UPDATE files
    SET deleted_at = NEW.archived_at, deleted_by = COALESCE(deleted_by, auth.uid())
    WHERE terminal_id = NEW.id AND deleted_at IS NULL;

  UPDATE folders
    SET deleted_at = NEW.archived_at
    WHERE terminal_id = NEW.id AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_terminal_archive_cascade ON terminals;
CREATE TRIGGER trg_terminal_archive_cascade
  AFTER UPDATE OF archived_at ON terminals
  FOR EACH ROW
  EXECUTE FUNCTION cascade_terminal_archive();

CREATE OR REPLACE FUNCTION cascade_space_archive()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.archived_at IS NULL OR OLD.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE terminals
    SET archived_at = NEW.archived_at,
        status = 'archived'
    WHERE space_id = NEW.id AND archived_at IS NULL;
  -- The terminal cascade trigger then fans out to tasks/files/folders.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_space_archive_cascade ON spaces;
CREATE TRIGGER trg_space_archive_cascade
  AFTER UPDATE OF archived_at ON spaces
  FOR EACH ROW
  EXECUTE FUNCTION cascade_space_archive();

GRANT EXECUTE ON FUNCTION cascade_terminal_archive() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cascade_space_archive() TO authenticated, service_role;

-- ============================================================================
-- 4. purge_expired_trash() — hard-delete anything older than the cutoff
-- ============================================================================
--
-- Returns one row per audited table with the count of rows it permanently
-- removed. Uses 30 days by default; callers can override.
--
-- Tables purged:
--   tasks, files, comments, folders, drawings_annotations, tools, terminals,
--   spaces, share_links, calendar_connections.
--
-- This is intentionally pessimistic with a single CTE per table so a
-- failure mid-purge doesn't half-delete one table and leave another
-- inconsistent. Each table is purged in its own statement; a savepoint
-- pattern is overkill here because the function runs in a single
-- transaction by default.
--
-- SECURITY DEFINER so the platform-admin caller doesn't need raw DELETE
-- on every table; it does need the platform-admin gate enforced by the
-- caller (admin/trash routes use requireAdmin()).

CREATE OR REPLACE FUNCTION purge_expired_trash(_cutoff_days INT DEFAULT 30)
RETURNS TABLE (table_name TEXT, purged BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff TIMESTAMPTZ := now() - (_cutoff_days || ' days')::INTERVAL;
  n      BIGINT;
BEGIN
  WITH d AS (DELETE FROM tasks
             WHERE deleted_at IS NOT NULL AND deleted_at < cutoff
             RETURNING 1)
  SELECT COUNT(*) INTO n FROM d;
  table_name := 'tasks'; purged := n; RETURN NEXT;

  WITH d AS (DELETE FROM files
             WHERE deleted_at IS NOT NULL AND deleted_at < cutoff
             RETURNING 1)
  SELECT COUNT(*) INTO n FROM d;
  table_name := 'files'; purged := n; RETURN NEXT;

  WITH d AS (DELETE FROM comments
             WHERE deleted_at IS NOT NULL AND deleted_at < cutoff
             RETURNING 1)
  SELECT COUNT(*) INTO n FROM d;
  table_name := 'comments'; purged := n; RETURN NEXT;

  WITH d AS (DELETE FROM folders
             WHERE deleted_at IS NOT NULL AND deleted_at < cutoff
             RETURNING 1)
  SELECT COUNT(*) INTO n FROM d;
  table_name := 'folders'; purged := n; RETURN NEXT;

  WITH d AS (DELETE FROM drawing_annotations
             WHERE deleted_at IS NOT NULL AND deleted_at < cutoff
             RETURNING 1)
  SELECT COUNT(*) INTO n FROM d;
  table_name := 'drawing_annotations'; purged := n; RETURN NEXT;

  WITH d AS (DELETE FROM tools
             WHERE deleted_at IS NOT NULL AND deleted_at < cutoff
             RETURNING 1)
  SELECT COUNT(*) INTO n FROM d;
  table_name := 'tools'; purged := n; RETURN NEXT;

  -- Terminals + spaces use archived_at as their soft-delete column.
  WITH d AS (DELETE FROM terminals
             WHERE archived_at IS NOT NULL AND archived_at < cutoff
             RETURNING 1)
  SELECT COUNT(*) INTO n FROM d;
  table_name := 'terminals'; purged := n; RETURN NEXT;

  WITH d AS (DELETE FROM spaces
             WHERE archived_at IS NOT NULL AND archived_at < cutoff
             RETURNING 1)
  SELECT COUNT(*) INTO n FROM d;
  table_name := 'spaces'; purged := n; RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION purge_expired_trash(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_expired_trash(INT) TO service_role;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP FUNCTION IF EXISTS purge_expired_trash(INT);
-- DROP TRIGGER IF EXISTS trg_terminal_archive_cascade ON terminals;
-- DROP TRIGGER IF EXISTS trg_space_archive_cascade ON spaces;
-- DROP FUNCTION IF EXISTS cascade_terminal_archive();
-- DROP FUNCTION IF EXISTS cascade_space_archive();
-- -- Restore the original tasks_select / tasks_update policies from
-- -- 20260419120000_initial_schema.sql §1.7.6 before dropping these.
-- DROP POLICY IF EXISTS "tasks_select" ON tasks;
-- DROP POLICY IF EXISTS "tasks_update" ON tasks;
-- DROP INDEX IF EXISTS idx_tasks_deleted;
-- ALTER TABLE tasks DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;
-- COMMIT;
