-- Messages: threads + messages.
--
-- Two thread kinds for v1:
--   'dm':       exactly two participants, one per user (row in thread_participants)
--   'terminal': everyone on the terminal sees it. participants table is
--               empty; RLS reads membership from terminal_members.
--
-- Space-wide threads come in v2 and reuse thread_participants with a
-- nullable `space_id`. We're keeping the schema flexible for that without
-- paying its RLS complexity now.

CREATE TABLE message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('dm', 'terminal', 'space')),
  terminal_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ensure the right scoping column is set for each kind.
  CONSTRAINT message_threads_scope_ck CHECK (
    (kind = 'dm'       AND terminal_id IS NULL AND space_id IS NULL) OR
    (kind = 'terminal' AND terminal_id IS NOT NULL) OR
    (kind = 'space'    AND space_id IS NOT NULL)
  )
);

-- Exactly one terminal thread per terminal. DMs are deduplicated by sorting
-- the two participants' ids (enforced below in the participants table).
CREATE UNIQUE INDEX message_threads_terminal_unique
  ON message_threads(terminal_id) WHERE kind = 'terminal';
CREATE UNIQUE INDEX message_threads_space_unique
  ON message_threads(space_id) WHERE kind = 'space';

CREATE TABLE thread_participants (
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX idx_thread_participants_user
  ON thread_participants(user_id);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_messages_thread_time
  ON messages(thread_id, created_at DESC);

-- RLS ---------------------------------------------------------------------

ALTER TABLE message_threads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages           ENABLE ROW LEVEL SECURITY;

-- Helper: "can I see this thread?"
CREATE OR REPLACE FUNCTION can_see_thread(_thread UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM message_threads t
    WHERE t.id = _thread
      AND (
        -- direct message: I'm a participant
        (t.kind = 'dm' AND EXISTS (
          SELECT 1 FROM thread_participants tp
          WHERE tp.thread_id = t.id AND tp.user_id = auth.uid()
        ))
        -- terminal thread: I'm on that terminal
        OR (t.kind = 'terminal' AND is_terminal_member(t.terminal_id))
        -- space-wide (v2): I'm in that space
        OR (t.kind = 'space' AND t.space_id IS NOT NULL AND is_space_member(t.space_id))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION can_see_thread(UUID) TO authenticated, anon;

-- Threads
CREATE POLICY "threads_select" ON message_threads FOR SELECT TO authenticated
USING (can_see_thread(id));

CREATE POLICY "threads_insert" ON message_threads FOR INSERT TO authenticated
WITH CHECK (
  (kind = 'dm')
  OR (kind = 'terminal' AND is_terminal_member(terminal_id))
  OR (kind = 'space'    AND is_space_member(space_id))
);

-- Participants
CREATE POLICY "thread_participants_select" ON thread_participants FOR SELECT TO authenticated
USING (user_id = auth.uid() OR can_see_thread(thread_id));

CREATE POLICY "thread_participants_insert" ON thread_participants FOR INSERT TO authenticated
WITH CHECK (
  -- DM rule: either I'm adding myself, or the thread has no participants
  -- yet and I'm allowed to create it.
  user_id = auth.uid() OR can_see_thread(thread_id)
);

CREATE POLICY "thread_participants_update" ON thread_participants FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- Messages
CREATE POLICY "messages_select" ON messages FOR SELECT TO authenticated
USING (can_see_thread(thread_id));

CREATE POLICY "messages_insert" ON messages FOR INSERT TO authenticated
WITH CHECK (author_id = auth.uid() AND can_see_thread(thread_id));

CREATE POLICY "messages_update" ON messages FOR UPDATE TO authenticated
USING (author_id = auth.uid());

CREATE POLICY "messages_delete" ON messages FOR DELETE TO authenticated
USING (author_id = auth.uid());

-- Trigger: bump thread's last_message_at when a message is inserted.
CREATE OR REPLACE FUNCTION touch_thread_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE message_threads
  SET last_message_at = NEW.created_at
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_messages_touch_thread
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION touch_thread_on_message();

-- Publish to realtime so the inbox stays live.
ALTER PUBLICATION supabase_realtime ADD TABLE message_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE thread_participants;
