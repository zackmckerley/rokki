-- Default-assignee = creator
--
-- When a task is INSERTed and no `task_assignees` row exists for it after
-- the row is committed, automatically insert one with user_id = created_by.
-- This catches every code path that creates tasks: the web POST endpoint,
-- ad-hoc DB inserts, MCP tools, future imports, etc. The web API also
-- inserts the row explicitly (defence in depth) — the trigger uses an
-- ON CONFLICT DO NOTHING so the API path stays a no-op in practice.
--
-- Notes on design:
--   * AFTER INSERT runs once per row even with multi-row inserts.
--   * SECURITY DEFINER + explicit search_path so the trigger doesn't depend
--     on RLS for its own write — the role that fires the trigger may not
--     pass the task_assignees_insert_owner_or_assignee policy in every code
--     path. The function only ever inserts (creator) for the task being
--     created, so it cannot be abused as a privilege escalator.
--   * Idempotent: re-running this migration is safe because every CREATE
--     uses OR REPLACE / IF NOT EXISTS.

CREATE OR REPLACE FUNCTION ensure_task_creator_assignee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip if the row already has at least one assignee (caller passed one
  -- explicitly within the same transaction), or if created_by is null.
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM task_assignees WHERE task_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO task_assignees (task_id, user_id, assigned_by)
  VALUES (NEW.id, NEW.created_by, NEW.created_by)
  ON CONFLICT (task_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_task_creator_assignee() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_tasks_default_assignee ON tasks;
CREATE TRIGGER trg_tasks_default_assignee
  AFTER INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION ensure_task_creator_assignee();
