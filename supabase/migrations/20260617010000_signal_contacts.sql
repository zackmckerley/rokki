-- Signal contacts + group directory.
--
-- The bridge pulls the linked account's contacts (signal-cli `listContacts`)
-- and groups (`listGroups`) into this table so Rokki can (a) show real names
-- on conversations instead of phone numbers and (b) offer a "new message"
-- picker to start a chat with anyone in the user's Signal address book — even
-- before any message has flowed. Signal is the source of truth; this is a
-- read-through cache the bridge refreshes.

BEGIN;

CREATE TABLE signal_contacts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id  TEXT NOT NULL,                 -- phone/uuid (direct) OR group id
  kind       TEXT NOT NULL CHECK (kind IN ('direct', 'group')),
  name       TEXT,                          -- contact / group display name
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, signal_id)
);

CREATE INDEX idx_signal_contacts_user ON signal_contacts(user_id);

ALTER TABLE signal_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signal_contacts_owner" ON signal_contacts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Live updates so a freshly-synced directory appears without a refresh.
ALTER PUBLICATION supabase_realtime ADD TABLE signal_contacts;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- ALTER PUBLICATION supabase_realtime DROP TABLE signal_contacts;
-- DROP TABLE IF EXISTS signal_contacts CASCADE;
-- COMMIT;
