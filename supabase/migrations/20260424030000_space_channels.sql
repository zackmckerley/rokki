-- Every space gets a "lobby" channel: one #general thread where everyone
-- in that space can post. Backfill existing spaces + trigger ensures new
-- ones land with a channel already attached.

-- 1. Backfill: one space-kind thread per existing space that doesn't
--    already have one. The UNIQUE index on `space_id WHERE kind='space'`
--    from the messages migration keeps this idempotent.
INSERT INTO message_threads (kind, space_id)
SELECT 'space', s.id
FROM spaces s
WHERE NOT EXISTS (
  SELECT 1 FROM message_threads mt
  WHERE mt.kind = 'space' AND mt.space_id = s.id
);

-- 2. Trigger: on new space insert, auto-create its lobby channel.
CREATE OR REPLACE FUNCTION create_space_channel()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO message_threads (kind, space_id)
  VALUES ('space', NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_space_channel
  AFTER INSERT ON spaces
  FOR EACH ROW EXECUTE FUNCTION create_space_channel();

-- 3. Same for terminals — every terminal gets a thread on create. Already
--    works on demand when a user first posts, but pre-creating makes
--    the channel visible in the inbox immediately.
CREATE OR REPLACE FUNCTION create_terminal_channel()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO message_threads (kind, terminal_id)
  VALUES ('terminal', NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_terminal_channel
  AFTER INSERT ON terminals
  FOR EACH ROW EXECUTE FUNCTION create_terminal_channel();

-- Backfill existing terminals too.
INSERT INTO message_threads (kind, terminal_id)
SELECT 'terminal', t.id
FROM terminals t
WHERE NOT EXISTS (
  SELECT 1 FROM message_threads mt
  WHERE mt.kind = 'terminal' AND mt.terminal_id = t.id
);
