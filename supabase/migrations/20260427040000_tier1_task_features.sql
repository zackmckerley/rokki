-- Tier-1 task feature additions:
--   - subtasks (checklist items, position-ordered, per task)
--   - task_watchers (notify-on-update audience, separate from assignees)
--   - recurrence: recurrence_rule jsonb + recurrence_parent_id on tasks
--   - "next-occurrence" trigger that fires when a recurring task is marked done
--
-- Notes on what we DID NOT add and why:
--   - priority: tasks.priority already exists (SMALLINT 1..4 in initial schema).
--     We layer a stable mapping (1=urgent, 2=high, 3=medium, 4=low) and fix the
--     default to 3 ("medium") rather than reshape the column — keeps the existing
--     index, RLS, and 7+ call sites working. The wrapper enum is in TypeScript.
--   - tags: tasks.labels TEXT[] already exists and the UI already speaks it.
--     A new join table would force a migration of every existing row + every
--     query path for zero functional gain.
--   - task_comments: the comments table already supports
--     entity_type='task' (initial schema §comments). The /api/v1/tasks/:id/comments
--     endpoints we add are thin proxies over /api/v1/comments — same rows,
--     same RLS, no duplicated history.
--   - status enum already covers todo/in_progress/blocked/review/done.
--
-- All times use now() in DEFAULT clauses only (never in partial-index
-- predicates — see commit b766dfd).

-- ============================================================================
-- 1. tasks: recurrence + parent-child link
-- ============================================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence_rule JSONB,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Sanity check on the rule shape — keep loose so the UI can extend without
-- a schema migration each time, but reject obvious garbage.
ALTER TABLE tasks
  ADD CONSTRAINT tasks_recurrence_rule_shape CHECK (
    recurrence_rule IS NULL
    OR (
      jsonb_typeof(recurrence_rule) = 'object'
      AND recurrence_rule ? 'pattern'
      AND recurrence_rule->>'pattern' IN ('daily', 'weekly', 'monthly')
      AND recurrence_rule ? 'interval'
      AND jsonb_typeof(recurrence_rule->'interval') = 'number'
    )
  );

-- Lookup index: when a parent is completed, the trigger reads its row again,
-- and the UI lists "occurrences of this series".
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_parent
  ON tasks(recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;

-- Filtering by priority is the single most common task-list operation after
-- status. Same partial-index strategy as idx_tasks_due — exclude done rows.
CREATE INDEX IF NOT EXISTS idx_tasks_priority
  ON tasks(terminal_id, priority)
  WHERE status <> 'done';

-- ============================================================================
-- 2. subtasks
-- ============================================================================
CREATE TABLE subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 500),
  done BOOLEAN NOT NULL DEFAULT FALSE,
  -- position is a sparse integer: clients pick a midpoint between neighbors
  -- to reorder without rewriting the whole list (LSEQ-style). Default to a
  -- large step so first inserts don't collide.
  position INT NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subtasks_task ON subtasks(task_id, position);

CREATE TRIGGER trg_subtasks_updated
  BEFORE UPDATE ON subtasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

-- Subtasks inherit visibility/edit rights from the parent task:
--   read   -> any terminal_member of the parent task's terminal
--   write  -> terminal_manager OR creator of the task OR an assignee
-- Same logic as tasks_update — we re-derive it via the parent task lookup.
CREATE POLICY "subtasks_select" ON subtasks FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = subtasks.task_id
      AND (is_terminal_member(t.terminal_id) OR has_emergency_access())
  )
);

CREATE POLICY "subtasks_insert" ON subtasks FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = subtasks.task_id
      AND (
        is_terminal_manager(t.terminal_id)
        OR t.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = t.id AND user_id = auth.uid())
      )
  )
);

CREATE POLICY "subtasks_update" ON subtasks FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = subtasks.task_id
      AND (
        is_terminal_manager(t.terminal_id)
        OR t.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = t.id AND user_id = auth.uid())
      )
  )
);

CREATE POLICY "subtasks_delete" ON subtasks FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = subtasks.task_id
      AND (
        is_terminal_manager(t.terminal_id)
        OR t.created_by = auth.uid()
      )
  )
);

-- ============================================================================
-- 3. task_watchers
-- ============================================================================
CREATE TABLE task_watchers (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX idx_task_watchers_user ON task_watchers(user_id);

ALTER TABLE task_watchers ENABLE ROW LEVEL SECURITY;

-- Anyone who can see the parent task can see who's watching it.
CREATE POLICY "task_watchers_select" ON task_watchers FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_watchers.task_id
      AND (is_terminal_member(t.terminal_id) OR has_emergency_access())
  )
);

-- Self-add OR add-someone-else (terminal manager / task creator).
CREATE POLICY "task_watchers_insert" ON task_watchers FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_watchers.task_id
      AND is_terminal_member(t.terminal_id)
      AND (
        task_watchers.user_id = auth.uid()
        OR is_terminal_manager(t.terminal_id)
        OR t.created_by = auth.uid()
      )
  )
);

-- Self-remove always allowed; managers / creators may unwatch others.
CREATE POLICY "task_watchers_delete" ON task_watchers FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_watchers.task_id
      AND (is_terminal_manager(t.terminal_id) OR t.created_by = auth.uid())
  )
);

-- ============================================================================
-- 4. Recurrence trigger -- "when this recurring task is marked done, spawn
--    the next occurrence so the user never has to remember"
--
-- Behaviour:
--   * runs only on UPDATE of status from <not done> -> done
--   * only fires for the SERIES PARENT (a task with a non-null
--     recurrence_rule). Child occurrences carry recurrence_parent_id but
--     not their own rule, so completing a child does nothing here.
--   * computes the next due_date from the rule's pattern + interval
--   * stops if the rule's end_date has passed
--   * carries over title, description, priority, labels, terminal,
--     created_by; resets status to 'todo', completed_at to NULL,
--     and points recurrence_parent_id at the parent.
--
-- We do this in a trigger (not a Vercel cron) because completion is the
-- natural moment, the work is same-DB, and a cron would race with manual
-- completes.
-- ============================================================================
CREATE OR REPLACE FUNCTION spawn_next_recurring_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pattern  TEXT;
  step     INT;
  end_date DATE;
  next_due DATE;
  base_due DATE;
BEGIN
  -- Only on a true done transition.
  IF NEW.status <> 'done' OR OLD.status = 'done' THEN
    RETURN NEW;
  END IF;
  -- Only the parent of a recurring series spawns occurrences.
  IF NEW.recurrence_rule IS NULL THEN
    RETURN NEW;
  END IF;

  pattern  := NEW.recurrence_rule->>'pattern';
  step     := COALESCE((NEW.recurrence_rule->>'interval')::INT, 1);
  end_date := CASE
    WHEN NEW.recurrence_rule ? 'end_date'
      AND NEW.recurrence_rule->>'end_date' <> ''
    THEN (NEW.recurrence_rule->>'end_date')::DATE
    ELSE NULL
  END;

  -- Anchor: the previous due date if set, otherwise today.
  base_due := COALESCE(NEW.due_date, CURRENT_DATE);

  next_due := CASE pattern
    WHEN 'daily'   THEN base_due + (step || ' days')::INTERVAL
    WHEN 'weekly'  THEN base_due + (step || ' weeks')::INTERVAL
    WHEN 'monthly' THEN base_due + (step || ' months')::INTERVAL
    ELSE NULL
  END;

  IF next_due IS NULL THEN
    RETURN NEW;
  END IF;
  IF end_date IS NOT NULL AND next_due > end_date THEN
    RETURN NEW;
  END IF;

  -- Spawn the next occurrence. ticker_seq is auto-assigned by the existing
  -- BEFORE INSERT trigger. Carry assignees forward intentionally so the
  -- person who owns the cadence keeps owning it.
  INSERT INTO tasks (
    terminal_id,
    title,
    description,
    status,
    priority,
    due_date,
    labels,
    metadata,
    created_by,
    recurrence_parent_id
  )
  VALUES (
    NEW.terminal_id,
    NEW.title,
    NEW.description,
    'todo',
    NEW.priority,
    next_due,
    NEW.labels,
    NEW.metadata,
    NEW.created_by,
    NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tasks_spawn_recurrence
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION spawn_next_recurring_task();

GRANT EXECUTE ON FUNCTION spawn_next_recurring_task() TO authenticated, service_role;

-- ============================================================================
-- 5. Realtime publication memberships -- UI subscribes to these for live updates.
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE subtasks;
ALTER PUBLICATION supabase_realtime ADD TABLE task_watchers;
