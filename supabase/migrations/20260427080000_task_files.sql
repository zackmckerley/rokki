-- task_files: many-to-many join between tasks and files.
--
-- A task can have any number of "attachments" — files already uploaded to
-- the same terminal that are linked to it for context. Same file can be
-- attached to multiple tasks (a single spec PDF references in five tasks).
--
-- Why a join table (vs. a tasks.file_ids[] column):
--   - we want to track WHO attached the file and WHEN (audit trail)
--   - we want O(1) lookups in either direction (files-by-task,
--     tasks-by-file) for the side panels
--   - RLS scopes per row, not per array entry
--
-- Cascade behavior: deleting either side removes the link. Soft-deleted
-- files (files.deleted_at IS NOT NULL) are filtered out at read time, not
-- by the FK — restore from trash should re-light the attachment.

CREATE TABLE task_files (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attached_by UUID NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (task_id, file_id)
);

CREATE INDEX idx_task_files_file ON task_files(file_id);
CREATE INDEX idx_task_files_attached_by ON task_files(attached_by);

ALTER TABLE task_files ENABLE ROW LEVEL SECURITY;

-- Read: any terminal member who can see the parent task can see its
-- attachments. We re-derive via the task's terminal_id rather than
-- duplicate it on the join row — keeps the link the single source of
-- truth and avoids a denormalized terminal_id column drifting from the
-- task's actual terminal.
CREATE POLICY "task_files_select" ON task_files FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_files.task_id
      AND (is_terminal_member(t.terminal_id) OR has_emergency_access())
  )
);

-- Write (insert/delete): same write rule as subtasks — terminal manager
-- OR the task creator OR an assignee. Plus the file must be visible to
-- the actor (its visibility policy applies; we don't bypass it here).
CREATE POLICY "task_files_insert" ON task_files FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_files.task_id
      AND (
        is_terminal_manager(t.terminal_id)
        OR t.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = t.id AND user_id = auth.uid())
      )
  )
  AND EXISTS (
    -- File must live in the same terminal as the task — we don't allow
    -- cross-terminal attachments; that would leak file metadata across
    -- the boundary.
    SELECT 1 FROM files f
    JOIN tasks t ON t.id = task_files.task_id
    WHERE f.id = task_files.file_id
      AND f.terminal_id = t.terminal_id
      AND f.deleted_at IS NULL
  )
);

CREATE POLICY "task_files_delete" ON task_files FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_files.task_id
      AND (
        is_terminal_manager(t.terminal_id)
        OR t.created_by = auth.uid()
        OR task_files.attached_by = auth.uid()
      )
  )
);
