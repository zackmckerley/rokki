-- Reminders message channel.
--
-- A new `kind = 'reminders'` for message_threads. Each user gets at
-- most one reminders thread of their own — Rokki posts due-soon /
-- overdue task pings into it so the messenger inbox carries the
-- "what do I owe today?" workflow alongside the conversational
-- threads. Eventually a cron worker pushes daily updates; for v0
-- the user (or the API) triggers refresh on demand.
--
-- Why a thread rather than email or a separate "reminders" page:
--   - Messenger is already the place users glance at for "what's
--     waiting on me?" — adding email is a new product surface
--     they'd have to build a habit around.
--   - Pings carry `pinging_task_id` so each reminder is a one-click
--     deep link back to the task.

BEGIN;

ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_kind_check;
ALTER TABLE message_threads
  ADD CONSTRAINT message_threads_kind_check
  CHECK (kind IN ('dm', 'terminal', 'space', 'group', 'reminders'));

-- Reminders threads are private to a single user (the only
-- participant). They have no terminal_id or space_id (the cross-
-- terminal "give me everything" shape is the whole point).
ALTER TABLE message_threads DROP CONSTRAINT IF EXISTS message_threads_scope_ck;
ALTER TABLE message_threads
  ADD CONSTRAINT message_threads_scope_ck CHECK (
    (kind = 'dm'        AND terminal_id IS NULL AND space_id IS NULL) OR
    (kind = 'group'     AND terminal_id IS NULL AND space_id IS NULL) OR
    (kind = 'reminders' AND terminal_id IS NULL AND space_id IS NULL) OR
    (kind = 'terminal'  AND terminal_id IS NOT NULL) OR
    (kind = 'space'     AND space_id IS NOT NULL)
  );

COMMIT;
