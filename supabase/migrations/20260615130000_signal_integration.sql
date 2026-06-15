-- Signal integration — Phase 0 data model. See docs/SIGNAL_INTEGRATION.md.
--
-- A user links their own Signal account (as a secondary device, via the
-- signal-bridge service) and their conversations/messages sync here. Every
-- row is private to the owner (RLS), like a personal space. The bridge writes
-- via the service role (bypasses RLS) on behalf of the linked user; the app
-- reads under the user's own session. No FK into the existing messages tables
-- yet — Signal data is self-contained for Phase 0.

BEGIN;

CREATE TABLE signal_accounts (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_number TEXT,
  device_id     INT,
  status        TEXT NOT NULL DEFAULT 'linking'
                  CHECK (status IN ('linking', 'active', 'error', 'unlinked')),
  linked_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE signal_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id       TEXT NOT NULL,                 -- recipient number/uuid OR group id
  kind            TEXT NOT NULL CHECK (kind IN ('direct', 'group')),
  title           TEXT,
  terminal_id     UUID REFERENCES terminals(id) ON DELETE SET NULL, -- optional pin
  muted           BOOLEAN NOT NULL DEFAULT false,
  sync_enabled    BOOLEAN NOT NULL DEFAULT true,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, signal_id)
);

CREATE INDEX signal_threads_recent_idx
  ON signal_threads (user_id, last_message_at DESC);

CREATE TABLE signal_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         UUID NOT NULL REFERENCES signal_threads(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id       TEXT,                          -- signal-cli message timestamp/id
  direction         TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  sender            TEXT,                          -- number/uuid of the sender
  body              TEXT,
  attachments       JSONB NOT NULL DEFAULT '[]'::jsonb,
  reactions         JSONB NOT NULL DEFAULT '[]'::jsonb,
  quote_external_id TEXT,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at         TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX signal_messages_thread_idx
  ON signal_messages (thread_id, sent_at);
CREATE UNIQUE INDEX signal_messages_dedupe_idx
  ON signal_messages (thread_id, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE signal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signal_accounts_owner" ON signal_accounts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "signal_threads_owner" ON signal_threads FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "signal_messages_owner" ON signal_messages FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP TABLE IF EXISTS signal_messages;
-- DROP TABLE IF EXISTS signal_threads;
-- DROP TABLE IF EXISTS signal_accounts;
-- COMMIT;
