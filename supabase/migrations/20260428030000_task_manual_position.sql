-- Manual ordering for tasks within a terminal.
--
-- Sparse INT — clients pick a midpoint between neighbours (LSEQ-style)
-- when reordering, so a single drag costs one UPDATE instead of rewriting
-- every row in the list. NULL means "no manual position yet" — only the
-- "Manual" sort in the UI looks at this column; the default sort (priority
-- → due → status → created) ignores it.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS position INT;

CREATE INDEX IF NOT EXISTS idx_tasks_terminal_position
  ON tasks(terminal_id, position)
  WHERE position IS NOT NULL;
