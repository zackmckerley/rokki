-- In-app notifications.
--
-- Writes are service-role only (created by server code on mention, invite,
-- assignment, reply, etc.). Reads and updates are scoped to auth.uid().
--
-- Also pushes `comments` into the realtime publication so UI comment
-- threads can stay live without polling.

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'mention',
      'comment_reply',
      'assigned',
      'invite',
      'tool_result',
      'system'
    )
  ),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body TEXT CHECK (body IS NULL OR char_length(body) <= 2000),
  entity_type TEXT,
  entity_id UUID,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  url TEXT,
  read_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX idx_notifications_user_recent
  ON notifications(user_id, created_at DESC);

CREATE INDEX idx_notifications_email_queue
  ON notifications(created_at)
  WHERE email_sent_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Inserts flow through the service role from API routes; no INSERT policy
-- for authenticated users (they shouldn't be able to forge notifications
-- to anyone including themselves).

-- Publish both notifications and comments so the client can subscribe.
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
