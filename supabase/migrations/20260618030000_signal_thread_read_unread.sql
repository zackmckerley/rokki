-- Unread tracking for the unified inbox.
--
-- Native threads already track per-user read state via
-- thread_participants.last_read_at. Signal threads had no read marker, so add
-- one. Two SECURITY INVOKER functions (RLS-respecting) return per-thread unread
-- counts for the current user, so the inbox can show unread badges without N
-- round-trips.

BEGIN;

ALTER TABLE signal_threads
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

-- Unread native messages per thread: messages newer than my last_read_at that
-- I didn't send. Joins thread_participants so it's scoped to my threads; RLS on
-- messages further scopes it. epoch fallback = "never read → all unread".
CREATE OR REPLACE FUNCTION rokki_unread_counts()
  RETURNS TABLE (thread_id UUID, unread BIGINT)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
AS $$
  SELECT m.thread_id, COUNT(*)::BIGINT
  FROM messages m
  JOIN thread_participants tp
    ON tp.thread_id = m.thread_id AND tp.user_id = auth.uid()
  WHERE m.deleted_at IS NULL
    AND m.author_id <> auth.uid()
    AND m.created_at > COALESCE(tp.last_read_at, 'epoch'::timestamptz)
  GROUP BY m.thread_id;
$$;

-- Unread Signal messages per thread: inbound messages newer than the thread's
-- last_read_at. Scoped to my own Signal threads.
CREATE OR REPLACE FUNCTION rokki_signal_unread_counts()
  RETURNS TABLE (thread_id UUID, unread BIGINT)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
AS $$
  SELECT sm.thread_id, COUNT(*)::BIGINT
  FROM signal_messages sm
  JOIN signal_threads st
    ON st.id = sm.thread_id AND st.user_id = auth.uid()
  WHERE sm.direction = 'in'
    AND sm.deleted_at IS NULL
    AND sm.sent_at > COALESCE(st.last_read_at, 'epoch'::timestamptz)
  GROUP BY sm.thread_id;
$$;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP FUNCTION IF EXISTS rokki_signal_unread_counts();
-- DROP FUNCTION IF EXISTS rokki_unread_counts();
-- ALTER TABLE signal_threads DROP COLUMN IF EXISTS last_read_at;
-- COMMIT;
