-- Tasks get a `starred` boolean so users can flag "this is the highest
-- priority for today" independent of the priority field. Starred tasks
-- sort to the top of every task list (auto + manual modes) so the
-- user's day-of-day priorities float without losing the underlying
-- priority/due/position ordering for everything else.
--
-- Shared (not per-user) for the first cut — most teams of 1-3 people
-- effectively star the same critical task. If a per-user need shows
-- up we'd add a `task_stars(task_id, user_id)` join table later.

ALTER TABLE tasks ADD COLUMN starred BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index — only starred rows are interesting for the
-- "show me what's starred" path. Keeps the index small.
CREATE INDEX tasks_starred_idx
  ON tasks (terminal_id, updated_at DESC)
  WHERE starred = TRUE AND deleted_at IS NULL;
