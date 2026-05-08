-- External assignees for tasks.
--
-- Until now task_assignees has only handled platform users (FK to
-- auth.users). Real-life delegation is messier — Zack often delegates
-- to vendors, lawyers, contractors who aren't in the workspace yet.
-- We model them as plain email addresses on the task itself; once
-- they sign up and get matched against the email, the row migrates
-- to a real task_assignees entry.
--
-- v0 trade-off: we use a `text[]` column on tasks rather than a new
-- table. Pros: no new RLS policies, no new indexes, "show me a
-- task's assignees" is one row read. Cons: querying "tasks
-- assigned to email X" requires an array-contains scan (acceptable
-- at our scale; future-proof with a GIN if we ever go big).

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS external_assignee_emails TEXT[]
    NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN tasks.external_assignee_emails IS
  'Email addresses the task is delegated to that don''t (yet) belong to a platform user. When a matching user signs up, server-side reconciliation moves them into task_assignees and clears the email from this list.';

-- Email shape validation lives at the API layer (lower-cased,
-- duplicated entries collapsed, basic regex). A DB CHECK with a
-- subquery is not portable; we trust the gate above the row write.

-- GIN index makes "find tasks for this email" cheap once we wire up
-- the reconcile job. Free for the array-contains lookups we'd run.
CREATE INDEX IF NOT EXISTS idx_tasks_external_assignee_emails
  ON tasks USING gin (external_assignee_emails);

COMMIT;
