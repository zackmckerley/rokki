-- Task "Request update" feature wiring.
--
-- Two coupled additions:
--
--   1. tasks gain a "latest status" pin — separate from comments.
--      It's the most recent answer to "where are we on this?" and
--      surfaces as a chip on the task row + in detail. Editable
--      inline; preserved as a record (not cleared on `done`).
--
--   2. message_threads gains a `group` kind for multi-assignee
--      pings. The schema already had `dm | terminal | space`; we
--      add `group` so the request-update flow can create a thread
--      with 3+ participants when a task has multiple assignees.
--
-- Plus: messages.pinging_task_id so the messenger UI can render a
-- "📌 task" chip + "Reply with status" button on the ping, and so
-- replies can be linked back to the task they're updating.
--
-- The thread re-uses across the task lifetime; on assignee change,
-- the calling code syncs `thread_participants` to the new set of
-- assignees + the requester.

BEGIN;

-- 1. Latest-status pin on tasks ---------------------------------------------

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS latest_status_text TEXT,
  ADD COLUMN IF NOT EXISTS latest_status_author_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS latest_status_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_thread_id UUID
    REFERENCES message_threads(id) ON DELETE SET NULL;

COMMENT ON COLUMN tasks.latest_status_text IS
  'Most recent status update on the task — the answer to "what''s the latest?". Set via /api/v1/tasks/:id/status-update or inline edit. Preserved as a record across status transitions including done.';
COMMENT ON COLUMN tasks.status_thread_id IS
  'Persistent message_threads row for status pings/replies on this task. Created lazily on first request-update; participants are synced to assignees + requester whenever assignees change.';

-- 2. message_threads kind: add 'group' ----------------------------------

ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_kind_check;
ALTER TABLE message_threads
  ADD CONSTRAINT message_threads_kind_check
  CHECK (kind IN ('dm', 'terminal', 'space', 'group'));

-- The scope-check needs to allow group threads (no terminal_id, no
-- space_id; participation is tracked in thread_participants only).
ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_scope_ck;
ALTER TABLE message_threads
  ADD CONSTRAINT message_threads_scope_ck CHECK (
    (kind = 'dm'       AND terminal_id IS NULL AND space_id IS NULL) OR
    (kind = 'group'    AND terminal_id IS NULL AND space_id IS NULL) OR
    (kind = 'terminal' AND terminal_id IS NOT NULL) OR
    (kind = 'space'    AND space_id IS NOT NULL)
  );

-- 3. messages.pinging_task_id ----------------------------------

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS pinging_task_id UUID
    REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_pinging_task
  ON messages(pinging_task_id) WHERE pinging_task_id IS NOT NULL;

COMMENT ON COLUMN messages.pinging_task_id IS
  'When non-null, this message is a "request update" ping referencing the named task. Renders a 📌 chip + "Reply with status" button in the inbox.';

COMMIT;
